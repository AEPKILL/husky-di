/**
 * @overview Verifies conformance lifetime.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	type RpcConformanceCaseResult,
	RpcConformanceStatusEnum,
	type RpcProtocolConformanceCandidate,
	runRpcProtocolConformance,
} from "../../src/conformance";

describe("Protocol conformance lifetime", () => {
	it("RPC-CONFORMANCE-001 RPC-CONFORMANCE-002 disposes partial construction and preserves ordered operation failures", async () => {
		const primary = new Error("second construction failed");
		const releaseError = new Error("independent release failures");
		const releases: string[] = [];
		const reports: RpcConformanceCaseResult[] = [];
		let constructions = 0;
		const protocol: RpcProtocolConformanceCandidate = {
			connector() {
				constructions += 1;
				if (constructions > 1) {
					throw primary;
				}
				return {
					bind: async () => {},
					shutdown: async () => {},
					close() {
						releases.push("close");
						throw releaseError;
					},
					cleanup() {
						releases.push("cleanup");
						throw releaseError;
					},
				};
			},
			acceptor() {
				throw primary;
			},
		};
		const error: unknown = await runRpcProtocolConformance(
			{
				protocol,
				counterExhaustionProtocol: protocol,
				createActiveProtocolFaultMessage: () => new Uint8Array(),
			},
			{ report: (result) => reports.push(result) },
		).catch((failure: unknown) => failure);

		expect(releases).toEqual(["close", "cleanup"]);
		expect(reports).toHaveLength(15);
		expect(error).toBeInstanceOf(AggregateError);
		const failures = (error as AggregateError).errors as Error[];
		expect(failures).toHaveLength(15);
		const cause = failures[0]?.cause as AggregateError;
		expect(cause).toBeInstanceOf(AggregateError);
		expect(cause.errors).toHaveLength(3);
		expect(cause.errors[0]).toBe(primary);
		expect(cause.errors[1]).toBe(releaseError);
		expect(cause.errors[2]).toBe(releaseError);
		for (const [index, report] of reports.entries()) {
			expect(report.status).toBe(RpcConformanceStatusEnum.failed);
			if (report.status === RpcConformanceStatusEnum.failed) {
				expect(report.error).toBe(failures[index]);
			}
		}
	});

	it("RPC-CONFORMANCE-001 RPC-CONFORMANCE-002 bounds all work and disposal separately and freezes late outcomes", async () => {
		vi.useFakeTimers();
		try {
			const handoff = Promise.withResolvers<void>();
			const cleanup = Promise.withResolvers<void>();
			const reports: RpcConformanceCaseResult[] = [];
			const releases: string[] = [];
			let currentCase = 0;
			const protocol: RpcProtocolConformanceCandidate = {
				connector() {
					if (currentCase > 2) {
						throw new Error("later candidate unavailable");
					}
					const blocked = currentCase === 2;
					const task = blocked ? cleanup.promise : Promise.resolve();
					return {
						bind(connection) {
							connection.message$.subscribe();
							return handoff.promise;
						},
						shutdown: async () => {},
						close() {
							if (blocked) releases.push("connector-close");
						},
						cleanup() {
							if (blocked) releases.push("connector-cleanup");
							return task;
						},
					};
				},
				acceptor() {
					if (currentCase > 2) {
						throw new Error("later candidate unavailable");
					}
					const blocked = currentCase === 2;
					const task = Promise.resolve();
					return {
						accept(connection) {
							connection.message$.subscribe();
							return handoff.promise;
						},
						shutdown: async () => {},
						close() {
							if (blocked) releases.push("acceptor-close");
						},
						cleanup() {
							if (blocked) releases.push("acceptor-cleanup");
							return task;
						},
					};
				},
			};
			const outcome = runRpcProtocolConformance(
				{
					protocol,
					counterExhaustionProtocol: protocol,
					createActiveProtocolFaultMessage: () => new Uint8Array(),
				},
				{
					report(result) {
						reports.push(result);
						currentCase += 1;
					},
				},
			).catch((error: unknown) => error);
			await vi.advanceTimersByTimeAsync(0);
			expect(reports).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(1_999);
			expect(releases).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);
			expect(releases).toEqual([
				"connector-close",
				"acceptor-close",
				"connector-cleanup",
				"acceptor-cleanup",
			]);
			await vi.advanceTimersByTimeAsync(1_999);
			expect(reports).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(1);
			const error = await outcome;
			expect(error).toBeInstanceOf(AggregateError);
			expect(reports).toHaveLength(15);
			const report = reports[2];
			expect(report?.status).toBe(RpcConformanceStatusEnum.failed);
			if (report?.status !== RpcConformanceStatusEnum.failed) {
				throw new Error("Expected the bounded handoff case to fail.");
			}
			const cause = report.error.cause as AggregateError;
			expect(cause).toBeInstanceOf(AggregateError);
			expect(cause.errors).toHaveLength(2);
			const causes = [...cause.errors];
			handoff.reject(new Error("handoff rejected after work sealed"));
			cleanup.reject(new Error("cleanup rejected after its deadline"));
			await vi.advanceTimersByTimeAsync(10_000);
			expect(reports).toHaveLength(15);
			expect(report.error.cause).toBe(cause);
			expect(cause.errors).toEqual(causes);
			expect(releases).toHaveLength(4);
		} finally {
			vi.useRealTimers();
		}
	});
});
