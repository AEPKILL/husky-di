/**
 * @overview Verifies protocol lifetime.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	type RpcConformanceCaseResult,
	runRpcProtocolConformance,
} from "../../src/conformance";
import { runTargetCase } from "./lifetime/test.utils";
import { createMemoryProtocolFixture } from "./test.utils";

describe("Protocol conformance case lifetime", () => {
	it("RPC-CONFORMANCE-002 releases the first construction role when the second factory throws", async () => {
		const fixture = createMemoryProtocolFixture();
		const failure = new Error("second factory failed");
		let constructions = 0;
		let closes = 0;
		let cleanups = 0;
		const reports: RpcConformanceCaseResult[] = [];
		const outcome = await runRpcProtocolConformance(
			{
				...fixture,
				protocol: {
					...fixture.protocol,
					connector(host) {
						constructions += 1;
						if (constructions === 2) throw failure;
						const role = fixture.protocol.connector(host);
						if (constructions !== 1) return role;
						return {
							bind: role.bind.bind(role),
							shutdown: role.shutdown.bind(role),
							close() {
								closes += 1;
								role.close();
							},
							cleanup() {
								cleanups += 1;
								return role.cleanup();
							},
						};
					},
				},
			},
			{ report: (result) => reports.push(result) },
		).catch((error: unknown) => error);

		expect(closes).toBe(1);
		expect(cleanups).toBe(1);
		expect(reports).toHaveLength(15);
		expect(outcome).toBeInstanceOf(AggregateError);
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause).toBe(failure);
	});

	it("RPC-CONFORMANCE-001 counts an awaited cleanup rejection once without a synthetic body failure", async () => {
		const failure = new Error("cleanup rejected");
		const run = runTargetCase(12, (candidate) => ({
			...candidate,
			connector(host) {
				const role = candidate.connector(host);
				return {
					bind: role.bind.bind(role),
					shutdown: role.shutdown.bind(role),
					close: role.close.bind(role),
					cleanup: () => Promise.reject(failure),
				};
			},
		}));

		const outcome = await run.outcome;
		expect(outcome).toBeInstanceOf(AggregateError);
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause).toBe(failure);
	});

	it("RPC-CONFORMANCE-002 rejects cleanup settlements that overrun the absolute disposal deadline before its timer runs", async () => {
		vi.useFakeTimers();
		try {
			const run = runTargetCase(0, (candidate) => ({
				...candidate,
				connector(host) {
					const role = candidate.connector(host);
					return {
						bind: role.bind.bind(role),
						shutdown: role.shutdown.bind(role),
						close: role.close.bind(role),
						cleanup() {
							vi.setSystemTime(Date.now() + 2_001);
							return role.cleanup();
						},
					};
				},
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect(outcome).toBeInstanceOf(AggregateError);
			const failures = (outcome as AggregateError).errors;
			expect(failures).toHaveLength(1);
			expect(failures[0].cause).toBeInstanceOf(AggregateError);
			expect((failures[0].cause as AggregateError).errors).toHaveLength(2);
			expect(
				(failures[0].cause as AggregateError).errors.every((error: Error) =>
					error.message.includes("disposal deadline"),
				),
			).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		0, 1,
	])("RPC-CONFORMANCE-002 deduplicates a repeated construction identity in case %s while preserving freshness failure", async (index) => {
		let closes = 0;
		let cleanups = 0;
		const task = Promise.resolve();
		const role = {
			bind: () => task,
			accept: () => task,
			shutdown: () => task,
			close: () => {
				closes += 1;
			},
			cleanup: () => {
				cleanups += 1;
				return task;
			},
		};
		const run = runTargetCase(index, () => ({
			connector: () => role,
			acceptor: () => role,
		}));
		const outcome = await run.outcome;
		expect(closes).toBe(1);
		expect(cleanups).toBe(1);
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause.message).toContain(
			"must be fresh",
		);
	});

	it("RPC-CONFORMANCE-002 captures throwing capability getters independently and never invokes guessed members", async () => {
		const closeFailure = new Error("close getter failed");
		const cleanupFailure = new Error("cleanup getter failed");
		let cleanupReads = 0;
		let shutdownReads = 0;
		const run = runTargetCase(0, () => ({
			connector: () =>
				({
					get close() {
						throw closeFailure;
					},
					get cleanup() {
						cleanupReads += 1;
						throw cleanupFailure;
					},
					get shutdown() {
						shutdownReads += 1;
						return () => Promise.resolve();
					},
				}) as never,
			acceptor: () => {
				throw new Error("Unexpected acquisition");
			},
		}));
		const outcome = await run.outcome;
		expect(cleanupReads).toBe(1);
		expect(shutdownReads).toBe(0);
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause.errors).toEqual([
			closeFailure,
			cleanupFailure,
		]);
	});

	it("RPC-CONFORMANCE-002 cleans up a malformed role after its independent close capability read fails", async () => {
		const closeFailure = new Error("unreadable close");
		let cleanups = 0;
		const run = runTargetCase(0, () => ({
			connector: () =>
				({
					get close() {
						throw closeFailure;
					},
					cleanup() {
						cleanups += 1;
						return Promise.resolve();
					},
				}) as never,
			acceptor: () => {
				throw new Error("Unexpected acquisition");
			},
		}));
		const outcome = await run.outcome;
		expect(cleanups).toBe(1);
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause).toBe(closeFailure);
	});

	it("RPC-CONFORMANCE-001 consumes acceptance rejection before a throwing bind and independently terminates transport", async () => {
		const acceptFailure = new Error("accept rejected");
		const bindFailure = new Error("bind threw");
		const closeFailure = new Error("close threw");
		let transportCompletions = 0;
		let closes = 0;
		let cleanups = 0;
		let aborted = false;
		const run = runTargetCase(2, () => ({
			connector: () => ({
				bind: () => {
					throw bindFailure;
				},
				shutdown: async () => {},
				close: () => {
					closes += 1;
					throw closeFailure;
				},
				cleanup: async () => {
					cleanups += 1;
				},
			}),
			acceptor: () => ({
				accept(connection, signal) {
					connection.message$.subscribe({
						complete: () => {
							transportCompletions += 1;
						},
					});
					signal.addEventListener("abort", () => {
						aborted = true;
					});
					return Promise.reject(acceptFailure);
				},
				shutdown: async () => {},
				close: () => {
					closes += 1;
				},
				cleanup: async () => {
					cleanups += 1;
				},
			}),
		}));
		const outcome = await run.outcome;
		expect(aborted).toBe(true);
		expect(transportCompletions).toBe(1);
		expect(closes).toBe(2);
		expect(cleanups).toBe(2);
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause.errors).toEqual([
			bindFailure,
			closeFailure,
			acceptFailure,
		]);
	});
});
