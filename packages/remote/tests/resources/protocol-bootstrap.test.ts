/**
 * @overview Verifies protocol bootstrap.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	RpcFreshAccept,
	RpcProtocolSessionTransition,
} from "../../src/modules/protocol";
import { createRpcSecurityCarrier } from "../../src/modules/protocol";
import {
	accept,
	createAcceptorRuntime,
	createBootstrapConnection,
	createConnectorRuntime,
	createFreshAccept,
	createFreshRequest,
	createPolicy,
	createResumeRequest,
	type RpcSynchronousMessageTerminal,
} from "./bootstrap/test.utils";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Default RPC Protocol bootstrap resources", () => {
	it("RPC-SEC-002 RPC-SEC-008 creates canonical 256-bit carriers and overwrites controlled temporary bytes", () => {
		const generatedBytes: Uint8Array[] = [];
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((
			bytes: Uint8Array,
		) => {
			bytes.fill(generatedBytes.length + 1);
			generatedBytes.push(bytes);
			return bytes;
		}) as Crypto["getRandomValues"]);

		const first = createRpcSecurityCarrier();
		const second = createRpcSecurityCarrier();

		expect(first).toMatch(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u);
		expect(second).toMatch(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u);
		expect(second).not.toBe(first);
		for (const carrier of [first, second]) {
			const padded = `${carrier.replaceAll("-", "+").replaceAll("_", "/")}=`;
			expect(atob(padded)).toHaveLength(32);
		}
		expect(generatedBytes).toHaveLength(2);
		for (const bytes of generatedBytes) {
			expect(bytes).toEqual(new Uint8Array(32));
		}
	});

	it("RPC-SPI-008 RPC-TRANSPORT-005 RPC-WIRE-009 RPC-SESSION-011 holds FreshAccept until FreshRequest Local Admission", async () => {
		const requestAdmission = Promise.withResolvers<void>();
		const { runtime, ownerFaults, attachedSessions } = createConnectorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const connection = createBootstrapConnection(requestAdmission.promise);
		let settled = false;
		const task = runtime.bind(
			connection.connection,
			new AbortController().signal,
		);
		void task.then(
			() => {
				settled = true;
			},
			() => {},
		);
		await vi.waitFor(() => expect(connection.responses).toHaveLength(1));

		connection.emit(createFreshAccept(connection.responses[0] ?? {}));
		await Promise.resolve();
		await Promise.resolve();

		expect(attachedSessions).toEqual([]);
		expect(settled).toBe(false);

		requestAdmission.resolve();
		await expect(task).resolves.toBeUndefined();
		expect(attachedSessions).toEqual([1]);
		expect(settled).toBe(true);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-START-005 RPC-SPI-008 RPC-WIRE-009 RPC-SESSION-003 RPC-SESSION-011 retains Fresh before reply Local Admission, activates afterward, and ignores late abort", async () => {
		const replyAdmission = Promise.withResolvers<void>();
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => transitions.push(transition),
		);
		const controller = new AbortController();
		const connection = createBootstrapConnection(replyAdmission.promise);
		let settled = false;
		const task = runtime.accept(connection.connection, controller.signal);
		void task.then(
			() => {
				settled = true;
			},
			() => {},
		);

		connection.emit(createFreshRequest());
		await vi.waitFor(() =>
			expect(connection.responses.at(-1)).toMatchObject({ kind: "accept" }),
		);

		expect(admittedSessions).toEqual([1]);
		expect(settled).toBe(false);
		expect(transitions).toEqual([]);

		replyAdmission.resolve();
		await expect(task).resolves.toBeUndefined();
		expect(settled).toBe(true);

		controller.abort();
		await Promise.resolve();
		expect(connection.closeCount).toBe(0);
		expect(transitions).toEqual([]);

		connection.complete();
		await vi.waitFor(() =>
			expect(transitions.at(-1)).toMatchObject({ type: "recovering" }),
		);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-START-005 RPC-SESSION-011 lets Resume Binding Activation defeat a reentrant abort", async () => {
		const replacementController = new AbortController();
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
			(transition) => {
				transitions.push(transition);
				if (transition.type === "recovered") {
					replacementController.abort();
				}
			},
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

		const replacement = createBootstrapConnection();
		const replacementTask = runtime.accept(
			replacement.connection,
			replacementController.signal,
		);
		replacement.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 1),
		);

		await expect(replacementTask).resolves.toBeUndefined();
		expect(transitions.map((transition) => transition.type)).toEqual([
			"recovering",
			"recovered",
		]);
		expect(replacement.closeCount).toBe(0);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it.each([
		"shutdown",
		"close",
	] as const)("RPC-SPI-012 RPC-SESSION-011 %s fences a pre-activation Resume and prevents late activation", async (mode) => {
		const transitions: RpcProtocolSessionTransition[] = [];
		const { runtime, ownerFaults } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
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

		const replyAdmission = Promise.withResolvers<void>();
		const replacement = createBootstrapConnection(replyAdmission.promise);
		const replacementTask = runtime.accept(
			replacement.connection,
			new AbortController().signal,
		);
		void replacementTask.catch(() => {});
		replacement.emit(
			createResumeRequest(freshAccept.sessionId, freshAccept.resumeToken, 1),
		);
		await vi.waitFor(() =>
			expect(replacement.responses.at(-1)).toMatchObject({
				kind: "accept",
				bindingEpoch: 2,
			}),
		);
		expect(
			transitions.filter((transition) => transition.type === "recovered"),
		).toEqual([]);

		let termination: Promise<void>;
		if (mode === "shutdown") {
			termination = runtime.shutdown();
		} else {
			runtime.close();
			termination = Promise.resolve();
		}

		await expect(replacementTask).rejects.toThrow();
		await expect(termination).resolves.toBeUndefined();
		await vi.waitFor(() => expect(replacement.closeCount).toBe(1));

		replyAdmission.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(
			transitions.filter((transition) => transition.type === "recovered"),
		).toEqual([]);
		expect(ownerFaults).toEqual([]);
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it.each([
		"error",
		"complete",
	] as const)("RPC-SPI-008 RPC-TRANSPORT-001 RPC-TRANSPORT-003 RPC-SESSION-011 RPC-RESOURCE-004 releases the handshake slot after synchronous message$ %s", async (terminalKind) => {
		const terminalError = new Error("Synchronous message source failed.");
		const synchronousTerminal: RpcSynchronousMessageTerminal =
			terminalKind === "error"
				? { kind: "error", error: terminalError }
				: { kind: "complete" };
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const terminal = createBootstrapConnection(
			Promise.resolve(),
			synchronousTerminal,
		);
		const terminalTask = runtime.accept(
			terminal.connection,
			new AbortController().signal,
		);
		void terminalTask.catch(() => {});

		await expect(terminalTask).rejects.toThrow();
		await vi.waitFor(() => expect(terminal.closeCount).toBe(1));

		const replacement = createBootstrapConnection();
		const replacementTask = accept(runtime, replacement);
		expect(replacement.subscriptionCount).toBe(1);
		replacement.emit(createResumeRequest());
		await expect(replacementTask).rejects.toThrow(
			"Default RPC resume was generically rejected.",
		);

		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);
		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});

	it("RPC-SPI-008 RPC-SPI-012 RPC-RESOURCE-004 RPC-SEC-009 retains the shared handshake permit until a Resume reject send settles", async () => {
		let releaseResumeReply!: () => void;
		const resumeReply = new Promise<void>((resolve) => {
			releaseResumeReply = resolve;
		});
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const resume = createBootstrapConnection(resumeReply);
		const resumeTask = accept(runtime, resume);
		resume.emit(createResumeRequest());
		await vi.waitFor(() =>
			expect(resume.responses).toEqual([
				{ kind: "reject", code: "resume-rejected" },
			]),
		);

		const overflow = createBootstrapConnection();
		const overflowTask = accept(runtime, overflow);
		await expect(overflowTask).rejects.toThrow(
			"Default RPC handshake capacity is full.",
		);
		expect(overflow.subscriptionCount).toBe(0);
		await vi.waitFor(() => expect(overflow.closeCount).toBe(1));

		releaseResumeReply();
		await expect(resumeTask).rejects.toThrow(
			"Default RPC resume was generically rejected.",
		);
		const replacement = createBootstrapConnection();
		accept(runtime, replacement);
		expect(replacement.subscriptionCount).toBe(1);
		expect(admittedSessions).toEqual([]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
		await expect(runtime.cleanup()).resolves.toBeUndefined();
	});
});
