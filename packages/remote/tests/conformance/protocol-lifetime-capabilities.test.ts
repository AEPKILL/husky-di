/**
 * @overview Public Protocol runner evidence for raw cleanup capabilities and task identity.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { describe, expect, it } from "vitest";

import {
	type RpcConformanceCaseResult,
	type RpcConformanceFailure,
	runRpcProtocolConformance,
} from "../../src/conformance";
import type { IRpcProtocolConnector } from "../../src/protocol";
import { createMemoryProtocolFixture } from "./test.utils";

describe("Protocol conformance raw lifetime capabilities", () => {
	it("RPC-CONFORMANCE-002 falls back to captured close after raw close access fails before invocation", async () => {
		const cause = new Error("Raw close getter failed.");
		let reads = 0;
		const calls: string[] = [];
		const failure = await runTargetCase(14, (role) => {
			const candidate: IRpcProtocolConnector = {
				bind: role.bind.bind(role),
				shutdown: role.shutdown.bind(role),
				get close() {
					reads += 1;
					if (reads === 2) throw cause;
					return function (this: IRpcProtocolConnector) {
						expect(this).toBe(candidate);
						calls.push("close");
						role.close();
					};
				},
				cleanup() {
					calls.push("cleanup");
					return role.cleanup();
				},
			};
			return candidate;
		});
		expect(failure.cause).toBe(cause);
		expect(reads).toBe(2);
		expect(calls).toEqual(["close", "cleanup"]);
	});

	it("RPC-CONFORMANCE-002 does not invoke a noncallable raw cleanup value and preserves captured fallback", async () => {
		let reads = 0;
		let calls = 0;
		const failure = await runTargetCase(14, (role) => ({
			bind: role.bind.bind(role),
			shutdown: role.shutdown.bind(role),
			close: role.close.bind(role),
			get cleanup() {
				reads += 1;
				if (reads === 2) return {} as IRpcProtocolConnector["cleanup"];
				return () => {
					calls += 1;
					return role.cleanup();
				};
			},
		}));
		expect(failure.cause).toEqual(
			new Error("Protocol role is missing cleanup()."),
		);
		expect({ reads, calls }).toEqual({ reads: 2, calls: 1 });
	});

	it.each([
		"shared-task",
		"distinct-tasks",
		"distinct-tasks-shared-error",
	] as const)("RPC-CONFORMANCE-001 retains raw cleanup failure provenance for %s", async (mode) => {
		const firstCause = new Error("First cleanup rejection.");
		const secondCause =
			mode === "distinct-tasks"
				? new Error("Second cleanup rejection.")
				: firstCause;
		let calls = 0;
		let sharedTask: Promise<void> | undefined;
		const failure = await runTargetCase(14, (role) => ({
			bind: role.bind.bind(role),
			shutdown: role.shutdown.bind(role),
			close: role.close.bind(role),
			cleanup() {
				calls += 1;
				if (mode === "shared-task") {
					sharedTask ??= Promise.reject(firstCause);
					return sharedTask;
				}
				return Promise.reject(calls === 1 ? firstCause : secondCause);
			},
		}));
		expect(calls).toBe(2);
		if (mode === "shared-task") {
			expect(failure.cause).toBe(firstCause);
		} else {
			expect(failure.cause).toBeInstanceOf(AggregateError);
			const causes = (failure.cause as AggregateError).errors;
			expect(causes).toHaveLength(3);
			expect(causes[0]).toEqual(
				new Error("cleanup() did not return its cached task."),
			);
			expect(causes[1]).toBe(firstCause);
			expect(causes[2]).toBe(secondCause);
		}
	});

	it.each([
		"close",
		"cleanup",
		"both",
	] as const)("RPC-CONFORMANCE-002 captures independent capability getters when %s access throws", async (failedMember) => {
		const closeError = new Error("Close access failed.");
		const cleanupError = new Error("Cleanup access failed.");
		const accesses: string[] = [];
		const calls: string[] = [];
		const failure = await runTargetCase(0, (role) => {
			const candidate: IRpcProtocolConnector = {
				bind: role.bind.bind(role),
				shutdown: role.shutdown.bind(role),
				get close() {
					accesses.push("close");
					if (failedMember !== "cleanup") throw closeError;
					return function (this: IRpcProtocolConnector) {
						expect(this).toBe(candidate);
						calls.push("close");
						role.close();
					};
				},
				get cleanup() {
					accesses.push("cleanup");
					if (failedMember !== "close") throw cleanupError;
					return function (this: IRpcProtocolConnector) {
						expect(this).toBe(candidate);
						calls.push("cleanup");
						return role.cleanup();
					};
				},
			};
			return candidate;
		});
		expect(accesses).toEqual(["close", "cleanup"]);
		if (failedMember === "both") {
			expect(failure.cause).toBeInstanceOf(AggregateError);
			const causes = (failure.cause as AggregateError).errors;
			expect(causes).toHaveLength(2);
			expect(causes[0]).toBe(closeError);
			expect(causes[1]).toBe(cleanupError);
			expect(calls).toEqual([]);
		} else {
			expect(failure.cause).toBe(
				failedMember === "close" ? closeError : cleanupError,
			);
			expect(calls).toEqual([failedMember === "close" ? "cleanup" : "close"]);
		}
	});

	it("RPC-CONFORMANCE-001 preserves the same Error thrown by close and rejected by cleanup as independent failures", async () => {
		const cause = new Error("Shared operation error.");
		const calls: string[] = [];
		const failure = await runTargetCase(14, (role) => ({
			bind: role.bind.bind(role),
			shutdown: role.shutdown.bind(role),
			close() {
				calls.push("close");
				role.close();
				throw cause;
			},
			cleanup() {
				calls.push("cleanup");
				return Promise.reject(cause);
			},
		}));
		expect(calls).toEqual(["close", "cleanup"]);
		expect(failure.cause).toBeInstanceOf(AggregateError);
		const causes = (failure.cause as AggregateError).errors;
		expect(causes).toHaveLength(2);
		expect(causes[0]).toBe(cause);
		expect(causes[1]).toBe(cause);
	});

	it.each([
		2, 3,
	])("RPC-CONFORMANCE-002 preserves fallback eligibility when cleanup getter read %s throws", async (failedRead) => {
		const cause = new Error("Raw cleanup getter failed.");
		let reads = 0;
		let calls = 0;
		const failure = await runTargetCase(14, (role) => {
			const candidate: IRpcProtocolConnector = {
				bind: role.bind.bind(role),
				shutdown: role.shutdown.bind(role),
				close: role.close.bind(role),
				get cleanup() {
					reads += 1;
					if (reads === failedRead) throw cause;
					return function (this: IRpcProtocolConnector) {
						expect(this).toBe(candidate);
						calls += 1;
						return role.cleanup();
					};
				},
			};
			return candidate;
		});
		expect(failure.cause).toBe(cause);
		expect(reads).toBe(failedRead);
		expect(calls).toBe(1);
	});

	it.each([
		"close",
		"cleanup",
	] as const)("RPC-CONFORMANCE-002 never retries a synchronously throwing raw %s body", async (member) => {
		const cause = new Error(`Raw ${member} body failed.`);
		const calls: string[] = [];
		const failure = await runTargetCase(14, (role) => ({
			bind: role.bind.bind(role),
			shutdown: role.shutdown.bind(role),
			close() {
				calls.push("close");
				role.close();
				if (member === "close") throw cause;
			},
			cleanup() {
				calls.push("cleanup");
				if (member === "cleanup") throw cause;
				return role.cleanup();
			},
		}));
		expect(failure.cause).toBe(cause);
		expect(calls).toEqual(["close", "cleanup"]);
	});

	it("RPC-CONFORMANCE-002 compares freshly read cleanup results even when each getter function caches its own task", async () => {
		let reads = 0;
		let calls = 0;
		const failure = await runTargetCase(14, (role) => {
			const candidate: IRpcProtocolConnector = {
				bind: role.bind.bind(role),
				shutdown: role.shutdown.bind(role),
				close: role.close.bind(role),
				get cleanup() {
					reads += 1;
					const task = Promise.resolve();
					return function (this: IRpcProtocolConnector) {
						expect(this).toBe(candidate);
						calls += 1;
						return task;
					};
				},
			};
			return candidate;
		});

		expect(failure.cause).toEqual(
			new Error("cleanup() did not return its cached task."),
		);
		expect({ reads, calls }).toEqual({ reads: 3, calls: 2 });
	});
});

async function runTargetCase(
	index: number,
	change: (role: IRpcProtocolConnector) => IRpcProtocolConnector,
): Promise<RpcConformanceFailure> {
	const fixture = createMemoryProtocolFixture();
	const reports: RpcConformanceCaseResult[] = [];
	const outcome = await runRpcProtocolConformance(
		{
			...fixture,
			protocol: {
				...fixture.protocol,
				connector(host) {
					const role = fixture.protocol.connector(host);
					return reports.length === index ? change(role) : role;
				},
			},
		},
		{ report: (report) => reports.push(report) },
	).catch((error: unknown) => error);
	expect(outcome).toBeInstanceOf(AggregateError);
	if (!(outcome instanceof AggregateError))
		throw new Error("Expected the targeted case failure.");
	expect(reports).toHaveLength(15);
	expect(outcome.errors).toHaveLength(1);
	const report = reports[index];
	if (report?.status !== "failed")
		throw new Error("Expected the targeted failed report.");
	expect(outcome.errors[0]).toBe(report.error);
	expect(reports.filter((entry) => entry.status === "passed")).toHaveLength(14);
	return report.error;
}
