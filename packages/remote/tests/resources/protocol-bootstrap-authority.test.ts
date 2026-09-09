/**
 * @overview Verifies protocol bootstrap authority.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	RpcFreshAccept,
	RpcProtocolSessionTransition,
} from "../../src/modules/protocol";
import { RpcWireRecordKindEnum } from "../../src/modules/protocol";
import {
	accept,
	createAcceptorRuntime,
	createBootstrapConnection,
	createConnectorRuntime,
	createFreshAccept,
	createFreshRequest,
	createPolicy,
	createResumeRequest,
} from "./bootstrap/test.utils";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Default RPC Protocol bootstrap resources", () => {
	it("RPC-SESSION-006 RPC-SESSION-007 RPC-SESSION-009 RPC-SEC-009 ignores late reply admission from a lower raw-token attempt", async () => {
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ maxHandshakes: 2, bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const fresh = createBootstrapConnection();
		const freshTask = accept(runtime, fresh);
		fresh.emit(createFreshRequest());
		await expect(freshTask).resolves.toBeUndefined();
		const freshAccept = fresh.responses.at(-1) as RpcFreshAccept;
		fresh.complete();
		await vi.waitFor(() =>
			expect(transitions.at(-1)).toMatchObject({ type: "recovering" }),
		);

		let releaseFirstReply!: () => void;
		const firstReply = new Promise<void>((resolve) => {
			releaseFirstReply = resolve;
		});
		const first = createBootstrapConnection(firstReply);
		const firstController = new AbortController();
		const firstTask = runtime.accept(first.connection, firstController.signal);
		void firstTask.catch(() => {});
		first.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 1),
		);
		await vi.waitFor(() =>
			expect(first.responses.at(-1)).toMatchObject({
				kind: "accept",
				bindingEpoch: 2,
			}),
		);
		firstController.abort();
		await expect(firstTask).rejects.toThrow(
			"Default RPC fresh acceptance was aborted.",
		);
		await vi.waitFor(() => expect(first.closeCount).toBe(1));

		const winner = createBootstrapConnection();
		const winnerTask = accept(runtime, winner);
		winner.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 2),
		);
		await expect(winnerTask).resolves.toBeUndefined();
		expect(winner.responses.at(-1)).toMatchObject({
			kind: "accept",
			bindingEpoch: 3,
		});

		releaseFirstReply();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(
			transitions.filter((transition) => transition.type === "recovered"),
		).toHaveLength(1);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-WIRE-009 RPC-SESSION-011 RPC-RECOVERY-002 rejects active ingress before reply Local Admission and never activates", async () => {
		let releaseReply!: () => void;
		const replySettlement = new Promise<void>((resolve) => {
			releaseReply = resolve;
		});
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const connection = createBootstrapConnection(replySettlement);
		const task = accept(runtime, connection);
		connection.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(connection.responses.at(-1)).toMatchObject({ kind: "accept" }),
		);

		connection.emit({ kind: RpcWireRecordKindEnum.ping });
		releaseReply();

		await expect(task).rejects.toThrow(
			"Default RPC active record arrived before Binding Activation.",
		);
		await vi.waitFor(() => expect(connection.closeCount).toBe(1));
		expect(transitions.at(-1)).toMatchObject({ type: "recovering" });
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("rolls back a Fresh Peer when abort reenters Topology admission", async () => {
		const controller = new AbortController();
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
			() => true,
			() => controller.abort(),
		);
		const connection = createBootstrapConnection();
		const task = runtime.accept(connection.connection, controller.signal);
		void task.catch(() => {});

		connection.emit(createFreshRequest());

		await expect(task).rejects.toThrow(
			"Default RPC fresh acceptance was aborted.",
		);
		expect(admittedSessions).toEqual([1]);
		expect(transitions).toEqual([{ type: "closed", reason: "forced-close" }]);
		expect(connection.responses).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-003 RPC-SESSION-010 RPC-SEC-009 discards Fresh admission after attempt abort while request admission is late", async () => {
		let releaseRequest!: () => void;
		const requestSettlement = new Promise<void>((resolve) => {
			releaseRequest = resolve;
		});
		const { runtime, ownerFaults, attachedSessions } = createConnectorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const controller = new AbortController();
		const stale = createBootstrapConnection(requestSettlement);
		const staleTask = runtime.bind(stale.connection, controller.signal);
		void staleTask.catch(() => {});
		await vi.waitFor(() => expect(stale.responses).toHaveLength(1));
		const acceptRecord = createFreshAccept(stale.responses[0] ?? {});
		stale.emit(acceptRecord);

		controller.abort();
		await expect(staleTask).rejects.toThrow(
			"Default RPC Connector binding attempt failed.",
		);
		await vi.waitFor(() => expect(stale.closeCount).toBe(1));
		const replacement = createBootstrapConnection();
		const replacementTask = runtime.bind(
			replacement.connection,
			new AbortController().signal,
		);
		void replacementTask.catch(() => {});
		expect(replacement.subscriptionCount).toBe(1);
		await vi.waitFor(() => expect(replacement.responses).toHaveLength(1));

		releaseRequest();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(attachedSessions).toEqual([]);
		expect(replacement.responses[0]).toEqual(createFreshRequest());
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-SESSION-004 RPC-VALID-003 rejects an unsupported Fresh profile before random generation", async () => {
		const random = vi.spyOn(globalThis.crypto, "getRandomValues");
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const connection = createBootstrapConnection();
		const task = accept(runtime, connection);
		connection.emit({
			...createFreshRequest(),
			profiles: ["unsupported-profile"],
		});
		await expect(task).rejects.toThrow(
			"Default RPC fresh unsupported-profile.",
		);

		expect(connection.responses).toEqual([
			{ kind: "reject", code: "unsupported-profile" },
		]);
		expect(random).not.toHaveBeenCalled();
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});

	it("RPC-VALID-003 keeps an invalid unbound first record Connection-scoped", async () => {
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy(),
		);
		const connection = createBootstrapConnection();
		const task = accept(runtime, connection);
		connection.emit({ kind: "bogus" });
		await expect(task).rejects.toThrow();

		expect(connection.responses).toEqual([]);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});
});
