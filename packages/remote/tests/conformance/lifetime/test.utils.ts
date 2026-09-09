/**
 * @overview Shared conformance/protocol-lifetime fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	type RpcConformanceCaseResult,
	type RpcProtocolConformanceCandidate,
	runRpcProtocolConformance,
} from "../../../src/conformance";
import { createMemoryProtocolFixture } from "../test.utils";

export function runTargetCase(
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
