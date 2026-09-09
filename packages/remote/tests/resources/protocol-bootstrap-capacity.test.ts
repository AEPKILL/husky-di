/**
 * @overview Verifies protocol bootstrap capacity.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	IRpcProtocolAcceptor,
	RpcSessionContinuityImpl,
} from "../../src/modules/protocol";
import {
	accept,
	createAcceptorRuntime,
	createBootstrapConnection,
	createFreshRequest,
	createPolicy,
} from "./bootstrap/test.utils";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Default RPC Protocol bootstrap resources", () => {
	it("RPC-SESSION-003 RPC-SESSION-004 RPC-RESOURCE-003 reserves capacity before random generation and releases it on cleanup", async () => {
		const protectedBytes = 512 * 1024;
		const totalBytes = 4 * 1024 * 1024;
		const created = createAcceptorRuntime(
			createPolicy({
				maxSessions: 1,
				maxRetainedBytesPerSession: totalBytes,
				maxRetainedBytesTotal: totalBytes,
				bindingAttemptTimeoutMs: 1_000,
			}),
		);
		const occupied = created.retainedBytes.reserve(totalBytes - protectedBytes);
		if (occupied === undefined) {
			throw new Error("Expected ordinary bytes beside the protected Session.");
		}
		let generation = 0;
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation(((bytes: Uint8Array) => {
				expect(created.retainedBytes.reserve(1)).toBeUndefined();
				generation += 1;
				bytes.fill(generation);
				return bytes;
			}) as Crypto["getRandomValues"]);
		const retained = createBootstrapConnection();
		const retainedTask = accept(created.runtime, retained);
		retained.emit(createFreshRequest());
		await expect(retainedTask).resolves.toBeUndefined();

		expect(random).toHaveBeenCalledTimes(2);
		expect(retained.responses[0]).toMatchObject({
			kind: "accept",
			profile: "husky-di-rpc/1",
			bindingEpoch: 1,
			sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
			resumeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
		});
		expect(retained.responses[0]?.sessionId).not.toBe(
			retained.responses[0]?.resumeToken,
		);
		const retainedSession = created.sessionImpls[0];
		expect(
			(retainedSession?._continuity as RpcSessionContinuityImpl | undefined)
				?._resumeToken,
		).toBe(retained.responses[0]?.resumeToken);

		const overflow = createBootstrapConnection();
		const overflowTask = accept(created.runtime, overflow);
		overflow.emit(createFreshRequest());
		await expect(overflowTask).rejects.toThrow(
			"Default RPC fresh admission-rejected.",
		);
		expect(overflow.responses).toEqual([
			{ kind: "reject", code: "admission-rejected" },
		]);
		expect(random).toHaveBeenCalledTimes(2);
		expect(created.retainedBytes.reserve(1)).toBeUndefined();

		created.runtime.close();
		expect(
			(retainedSession?._continuity as RpcSessionContinuityImpl | undefined)
				?._resumeToken,
		).toBeUndefined();
		const released = created.retainedBytes.reserve(protectedBytes);
		expect(released).toBeDefined();
		released?.release();
		occupied.release();
	});

	it("RPC-RESOURCE-006 holds Fresh capacity across reentrant victim termination", async () => {
		const totalBytes = 4 * 1024 * 1024;
		const policy = createPolicy({
			maxSessions: 1,
			maxHandshakes: 3,
			maxRetainedBytesPerSession: totalBytes,
			maxRetainedBytesTotal: totalBytes,
			bindingAttemptTimeoutMs: 1_000,
		});
		let runtime: IRpcProtocolAcceptor;
		let replacementStarted = false;
		const reentrant = createBootstrapConnection();
		const created = createAcceptorRuntime(policy, (transition) => {
			if (transition.type !== "closed" || replacementStarted) {
				return;
			}
			replacementStarted = true;
			accept(runtime, reentrant);
			reentrant.emit(createFreshRequest());
		});
		runtime = created.runtime;
		const retained = createBootstrapConnection();
		const retainedTask = accept(runtime, retained);
		retained.emit(createFreshRequest());
		await expect(retainedTask).resolves.toBeUndefined();
		const occupied = created.retainedBytes.reserve(totalBytes - 512 * 1024);
		if (occupied === undefined) {
			throw new Error("Expected ordinary bytes beside the protected Session.");
		}
		retained.complete();

		const fresh = createBootstrapConnection();
		const freshTask = accept(runtime, fresh);
		fresh.emit(createFreshRequest());
		await expect(freshTask).resolves.toBeUndefined();
		await vi.waitFor(() => expect(reentrant.closeCount).toBe(1));

		expect(reentrant.responses).toEqual([
			{ kind: "reject", code: "admission-rejected" },
		]);
		expect(created.admittedSessions).toEqual([1, 1]);
		expect(created.ownerFaults).toEqual([]);

		runtime.close();
		occupied.release();
	});

	it("RPC-SESSION-002 faults after exactly eight retained Session ID collisions", async () => {
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation(((bytes: Uint8Array) => {
				bytes.fill(0);
				return bytes;
			}) as Crypto["getRandomValues"]);
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ bindingAttemptTimeoutMs: 1_000 }),
		);
		const retained = createBootstrapConnection();
		const retainedTask = accept(runtime, retained);
		retained.emit(createFreshRequest());
		await expect(retainedTask).resolves.toBeUndefined();

		const colliding = createBootstrapConnection();
		const collidingTask = accept(runtime, colliding);
		colliding.emit(createFreshRequest());
		await expect(collidingTask).rejects.toThrow(
			"Default RPC Session ID failed.",
		);

		expect(random).toHaveBeenCalledTimes(10);
		expect(colliding.responses).toEqual([]);
		expect(admittedSessions).toEqual([1]);
		expect(ownerFaults).toEqual(["protocol-fault"]);

		runtime.close();
	});

	it("RPC-SESSION-002 RPC-SESSION-004 releases provisional identity and Session ownership after admission rejection", async () => {
		const fills = [1, 2, 1, 3];
		let generation = 0;
		const random = vi
			.spyOn(globalThis.crypto, "getRandomValues")
			.mockImplementation(((bytes: Uint8Array) => {
				bytes.fill(fills[generation] ?? 4);
				generation += 1;
				return bytes;
			}) as Crypto["getRandomValues"]);
		let admissionAttempt = 0;
		const { runtime, ownerFaults, admittedSessions } = createAcceptorRuntime(
			createPolicy({ maxSessions: 1, bindingAttemptTimeoutMs: 1_000 }),
			() => {},
			() => {
				admissionAttempt += 1;
				return admissionAttempt > 1;
			},
		);
		const rejected = createBootstrapConnection();
		const rejectedTask = accept(runtime, rejected);
		rejected.emit(createFreshRequest());
		await expect(rejectedTask).rejects.toThrow(
			"Default RPC fresh admission-rejected.",
		);
		expect(rejected.responses).toEqual([
			{ kind: "reject", code: "admission-rejected" },
		]);

		const replacement = createBootstrapConnection();
		const replacementTask = accept(runtime, replacement);
		replacement.emit(createFreshRequest());
		await expect(replacementTask).resolves.toBeUndefined();

		expect(random).toHaveBeenCalledTimes(4);
		expect(replacement.responses.at(-1)).toMatchObject({ kind: "accept" });
		expect(admittedSessions).toEqual([1]);
		expect(ownerFaults).toEqual([]);

		runtime.close();
	});
});
