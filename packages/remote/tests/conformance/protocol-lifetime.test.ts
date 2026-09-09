/**
 * @overview Public Protocol runner evidence for bounded case resource lifetimes.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { describe, expect, it, vi } from "vitest";

import {
	type RpcConformanceCaseResult,
	type RpcProtocolConformanceCandidate,
	runRpcProtocolConformance,
} from "../../src/conformance";
import type { IRpcProtocolSession } from "../../src/protocol";
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

	it("RPC-CONFORMANCE-002 spends one work interval across handoff and a later invocation wait", async () => {
		vi.useFakeTimers();
		try {
			const started = Date.now();
			let finishedAt: number | undefined;
			const run = runTargetCase(3, (candidate) => ({
				...candidate,
				connector(host) {
					const role = candidate.connector({
						...host,
						attachSession(session) {
							const delayed = new Proxy(session, {
								get(target, key) {
									if (key === "prepareInvocation") {
										return ((request, finish) =>
											target.prepareInvocation(request, (outcome) => {
												setTimeout(() => finish(outcome), 800);
											})) satisfies IRpcProtocolSession["prepareInvocation"];
									}
									const value: unknown = Reflect.get(target, key);
									return typeof value === "function"
										? value.bind(target)
										: value;
								},
							});
							return host.attachSession(delayed);
						},
					});
					return {
						bind(connection, signal) {
							return role
								.bind(connection, signal)
								.then(
									() =>
										new Promise<void>((resolve) => setTimeout(resolve, 1_300)),
								);
						},
						shutdown: role.shutdown.bind(role),
						close() {
							finishedAt = Date.now();
							role.close();
						},
						cleanup: role.cleanup.bind(role),
					};
				},
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect(finishedAt).toBe(started + 2_000);
			expect((outcome as AggregateError).errors).toHaveLength(1);
			expect((outcome as AggregateError).errors[0].cause.message).toContain(
				"work did not settle",
			);
			expect(run.reports).toHaveLength(15);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CONFORMANCE-002 revokes overdue host admission and blocks a later construction", async () => {
		vi.useFakeTimers();
		try {
			let constructions = 0;
			let admission: unknown = "not attempted";
			let closes = 0;
			const run = runTargetCase(0, (candidate) => ({
				...candidate,
				connector(host) {
					constructions += 1;
					vi.setSystemTime(Date.now() + 2_000);
					admission = host.attachSession({} as IRpcProtocolSession);
					return {
						bind: async () => {},
						shutdown: async () => {},
						close: () => {
							closes += 1;
						},
						cleanup: async () => {},
					};
				},
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect(constructions).toBe(1);
			expect(closes).toBe(1);
			expect(admission).toBeUndefined();
			expect((outcome as AggregateError).errors).toHaveLength(1);
			expect((outcome as AggregateError).errors[0].cause.message).toContain(
				"work did not settle",
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CONFORMANCE-002 revokes host and transport authority before handoff abort callbacks", async () => {
		vi.useFakeTimers();
		try {
			let admission: unknown = "not attempted";
			let aborts = 0;
			const run = runTargetCase(2, () => ({
				connector: () => ({
					bind(connection) {
						connection.message$.subscribe();
						return new Promise<void>(() => {});
					},
					shutdown: async () => {},
					close() {},
					cleanup: async () => {},
				}),
				acceptor: (host) => ({
					accept(connection, signal) {
						connection.message$.subscribe();
						signal.addEventListener("abort", () => {
							aborts += 1;
							admission = host.admitSession({} as IRpcProtocolSession);
							void connection.send(new Uint8Array([1]));
						});
						return new Promise<void>(() => {});
					},
					shutdown: async () => {},
					close() {},
					cleanup: async () => {},
				}),
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect(aborts).toBe(1);
			expect(admission).toBeUndefined();
			expect((outcome as AggregateError).errors).toHaveLength(1);
			expect(run.reports).toHaveLength(15);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CONFORMANCE-002 consumes a rejected shutdown task returned after synchronous work overruns its deadline", async () => {
		vi.useFakeTimers();
		try {
			const late = new Error("late shutdown rejection");
			const run = runTargetCase(12, (candidate) => ({
				...candidate,
				connector(host) {
					const role = candidate.connector(host);
					return {
						bind: role.bind.bind(role),
						shutdown() {
							vi.setSystemTime(Date.now() + 2_001);
							return Promise.reject(late);
						},
						close: role.close.bind(role),
						cleanup: role.cleanup.bind(role),
					};
				},
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect((outcome as AggregateError).errors).toHaveLength(1);
			expect((outcome as AggregateError).errors[0].cause.message).toContain(
				"work did not settle",
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CONFORMANCE-001 preserves a cleanup rejection observed between the work cutoff and disposal", async () => {
		vi.useFakeTimers();
		try {
			const late = new Error("cleanup crossed the work cutoff");
			const run = runTargetCase(14, (candidate) => ({
				...candidate,
				connector(host) {
					const role = candidate.connector(host);
					return {
						bind: role.bind.bind(role),
						shutdown: role.shutdown.bind(role),
						close: role.close.bind(role),
						cleanup() {
							vi.setSystemTime(Date.now() + 2_001);
							return Promise.reject(late);
						},
					};
				},
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect((outcome as AggregateError).errors).toHaveLength(1);
			const causes = (outcome as AggregateError).errors[0].cause.errors;
			expect(causes).toHaveLength(2);
			expect(causes[0].message).toContain("work did not settle");
			expect(causes[1]).toBe(late);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		0, 1,
	])("RPC-CONFORMANCE-002 disposes a role whose handoff capability is malformed in case %s", async (index) => {
		let closes = 0;
		let cleanups = 0;
		const createRole = () => ({
			shutdown: async () => {},
			close() {
				closes += 1;
			},
			cleanup: async () => {
				cleanups += 1;
			},
		});
		const run = runTargetCase(index, () => ({
			connector: createRole as never,
			acceptor: createRole as never,
		}));
		const outcome = await run.outcome;
		expect((outcome as AggregateError).errors).toHaveLength(1);
		expect((outcome as AggregateError).errors[0].cause.message).toContain(
			index === 0 ? "bind()" : "accept()",
		);
		expect(closes).toBe(1);
		expect(cleanups).toBe(1);
	});
	it.each([
		"shared",
		"distinct",
	] as const)("RPC-CONFORMANCE-001 assigns one frozen disposal timeout to each %s pending cleanup task", async (identity) => {
		vi.useFakeTimers();
		try {
			const tasks = [
				Promise.withResolvers<void>(),
				Promise.withResolvers<void>(),
			];
			let calls = 0;
			let started = 0;
			const run = runTargetCase(14, (candidate) => ({
				...candidate,
				connector(host) {
					const role = candidate.connector(host);
					return {
						bind: role.bind.bind(role),
						shutdown: role.shutdown.bind(role),
						close: role.close.bind(role),
						cleanup() {
							if (calls === 0) started = Date.now();
							const task = tasks[identity === "shared" ? 0 : calls];
							calls += 1;
							if (task === undefined)
								throw new Error("Unexpected cleanup retry.");
							return task.promise;
						},
					};
				},
			}));
			await vi.runAllTimersAsync();
			const outcome = await run.outcome;
			expect(Date.now() - started).toBe(identity === "shared" ? 4_000 : 2_000);
			expect(calls).toBe(2);
			const failures = (outcome as AggregateError).errors;
			expect(failures).toHaveLength(1);
			const causes = failures[0].cause.errors as Error[];
			expect(causes).toHaveLength(identity === "shared" ? 2 : 3);
			expect(causes[0]?.message).toContain(
				identity === "shared" ? "work did not settle" : "cached task",
			);
			expect(
				causes
					.slice(1)
					.every((error) => error.message.includes("disposal deadline")),
			).toBe(true);
			const finalReport = run.reports.at(-1);
			expect(finalReport?.status).toBe("failed");
			if (finalReport?.status === "failed")
				expect(finalReport.error).toBe(failures[0]);
			const frozenCauses = [...causes];
			tasks[0]?.reject(new Error("late first cleanup"));
			if (identity === "distinct")
				tasks[1]?.reject(new Error("late second cleanup"));
			await vi.runAllTimersAsync();
			expect(run.reports).toHaveLength(15);
			expect(failures[0].cause.errors).toEqual(frozenCauses);
		} finally {
			vi.useRealTimers();
		}
	});
});

function runTargetCase(
	index: number,
	change: (
		candidate: RpcProtocolConformanceCandidate,
	) => RpcProtocolConformanceCandidate,
): {
	readonly outcome: Promise<unknown>;
	readonly reports: RpcConformanceCaseResult[];
} {
	const fixture = createMemoryProtocolFixture();
	const candidate = change(fixture.protocol);
	const reports: RpcConformanceCaseResult[] = [];
	const outcome = runRpcProtocolConformance(
		{
			...fixture,
			protocol: {
				connector: (host) =>
					(reports.length === index ? candidate : fixture.protocol).connector(
						host,
					),
				acceptor: (host) =>
					(reports.length === index ? candidate : fixture.protocol).acceptor(
						host,
					),
			},
		},
		{ report: (report) => reports.push(report) },
	).catch((error: unknown) => error);
	return { outcome, reports };
}
