/**
 * @overview Framework-neutral RPC conformance runner contract tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";

import {
	type IRpcAcceptorAdapterConformanceFixture,
	type IRpcConnectorAdapterConformanceFixture,
	type RpcConformanceCaseResult,
	runRpcAcceptorAdapterConformance,
	runRpcConnectorAdapterConformance,
	runRpcProtocolConformance,
} from "../../src/conformance";
import type { IRpcProtocol } from "../../src/protocol";
import {
	createDefaultRpcCounterExhaustionProtocolForTest,
	getDefaultRpcProtocol,
} from "../../src/protocols/default/default-rpc-protocol.impl";
import {
	createMemoryAcceptorFixture,
	createMemoryConnectorFixture,
	createMemoryProtocolFixture,
} from "./test.utils";

describe("RPC conformance runner", () => {
	it("RPC-CONFORMANCE-001 continues, reports once, and aggregates the same failures in stable order", async () => {
		const constructionError = new Error("construction failed");
		const protocol = Object.freeze({
			createConnector(): never {
				throw constructionError;
			},
			createAcceptor(): never {
				throw constructionError;
			},
		}) satisfies IRpcProtocol;
		const reports: RpcConformanceCaseResult[] = [];

		const outcome = runRpcProtocolConformance(
			{
				protocol,
				counterExhaustionProtocol: protocol,
				createActiveProtocolFaultMessage: () => new Uint8Array(),
			},
			{ report: (result) => reports.push(result) },
		).catch((error: unknown) => error);

		const error = await outcome;
		expect(error).toBeInstanceOf(AggregateError);
		const failures = (error as AggregateError).errors as readonly Error[];
		const failedReports = reports.filter(
			(result) => result.status === "failed",
		);
		expect(failures.length).toBeGreaterThanOrEqual(2);
		expect(reports).toHaveLength(15);
		expect(failedReports).toHaveLength(failures.length);
		expect(failedReports.map((result) => result.caseId)).toEqual(
			failures.map((failure) => Reflect.get(failure, "caseId")),
		);
		expect(
			failedReports.every(
				(result, index) =>
					result.status === "failed" && result.error === failures[index],
			),
		).toBe(true);
		expect(new Set(reports.map((result) => result.caseId)).size).toBe(
			reports.length,
		);
	});

	it.each([
		[
			"Connector",
			runRpcConnectorAdapterConformance,
			{
				create: async () => {
					throw new Error("fresh Connector fixture failed");
				},
			} satisfies IRpcConnectorAdapterConformanceFixture,
		],
		[
			"Acceptor",
			runRpcAcceptorAdapterConformance,
			{
				create: async () => {
					throw new Error("fresh Acceptor fixture failed");
				},
			} satisfies IRpcAcceptorAdapterConformanceFixture,
		],
	] as const)("RPC-CONFORMANCE-001 %s Adapter suite uses a fresh fixture for every stable case", async (_role, run, fixture) => {
		const reports: RpcConformanceCaseResult[] = [];
		const error = await run(fixture as never, {
			report: (result) => reports.push(result),
		}).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(AggregateError);
		expect(reports.length).toBeGreaterThanOrEqual(2);
		expect(reports.every((result) => result.status === "failed")).toBe(true);
	});

	it("RPC-CONFORMANCE-002 Protocol runner accepts an independent minimal candidate", async () => {
		const reports: RpcConformanceCaseResult[] = [];

		await runRpcProtocolConformance(createMemoryProtocolFixture(), {
			report: (result) => reports.push(result),
		});

		expect(reports).toHaveLength(15);
		expect(reports.every((result) => result.status === "passed")).toBe(true);
	});

	it("RPC-CONFORMANCE-002 Protocol runner accepts the built-in husky-di-rpc/1 candidate", async () => {
		const reports: RpcConformanceCaseResult[] = [];
		const encoder = new TextEncoder();

		await runRpcProtocolConformance(
			{
				protocol: getDefaultRpcProtocol(),
				counterExhaustionProtocol:
					createDefaultRpcCounterExhaustionProtocolForTest(),
				createActiveProtocolFaultMessage: () =>
					encoder.encode(JSON.stringify({ kind: "bogus" })),
			},
			{ report: (result) => reports.push(result) },
		);

		expect(reports).toHaveLength(15);
		expect(reports.every((result) => result.status === "passed")).toBe(true);
	});

	it.each([
		[
			"Connector",
			runRpcConnectorAdapterConformance,
			createMemoryConnectorFixture(),
			10,
		],
		[
			"Acceptor",
			runRpcAcceptorAdapterConformance,
			createMemoryAcceptorFixture(),
			14,
		],
	] as const)("RPC-CONFORMANCE-003 %s Adapter runner accepts a conforming in-memory candidate", async (_role, run, fixture, expectedCaseCount) => {
		const reports: RpcConformanceCaseResult[] = [];
		await run(fixture as never, {
			report: (result) => reports.push(result),
		});

		expect(reports).toHaveLength(expectedCaseCount);
		expect(reports.every((result) => result.status === "passed")).toBe(true);
	});

	it("RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 RPC-TRANSPORT-004 RPC-TRANSPORT-005 RPC-TRANSPORT-006 RPC-TRANSPORT-007 RPC-TRANSPORT-010 RPC-CONFORMANCE-003 publishes canonical Adapter case IDs", async () => {
		const reports: RpcConformanceCaseResult[] = [];
		await runRpcConnectorAdapterConformance(createMemoryConnectorFixture(), {
			report: (result) => reports.push(result),
		});
		await runRpcAcceptorAdapterConformance(createMemoryAcceptorFixture(), {
			report: (result) => reports.push(result),
		});

		expect(
			reports.every((result) => result.caseId.startsWith("RPC-TRANSPORT-")),
		).toBe(true);
		expect(
			new Set(
				reports.flatMap(
					(result) => result.caseId.match(/RPC-TRANSPORT-\d{3}/g) ?? [],
				),
			),
		).toEqual(
			new Set([
				"RPC-TRANSPORT-001",
				"RPC-TRANSPORT-002",
				"RPC-TRANSPORT-003",
				"RPC-TRANSPORT-004",
				"RPC-TRANSPORT-005",
				"RPC-TRANSPORT-006",
				"RPC-TRANSPORT-007",
				"RPC-TRANSPORT-008",
				"RPC-TRANSPORT-009",
				"RPC-TRANSPORT-010",
				"RPC-TRANSPORT-011",
			]),
		);
	});
});
