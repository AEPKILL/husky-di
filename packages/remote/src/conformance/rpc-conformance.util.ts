/**
 * @overview Stable framework-neutral execution for RPC conformance cases.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	RpcConformanceFailure,
	RpcConformanceOptions,
} from "@/conformance/rpc-conformance.type";
import { RpcConformanceStatusEnum } from "@/enums/conformance/rpc-conformance-status.enum";

export interface IRpcConformanceCase {
	readonly caseId: string;
	run(): void | Promise<void>;
}

export async function runRpcConformanceCases(
	cases: readonly IRpcConformanceCase[],
	options?: RpcConformanceOptions,
): Promise<void> {
	const failures: RpcConformanceFailure[] = [];

	for (const testCase of cases) {
		try {
			await testCase.run();
			options?.report?.(
				Object.freeze({
					caseId: testCase.caseId,
					status: RpcConformanceStatusEnum.passed,
				}),
			);
		} catch (cause) {
			const failure = createRpcConformanceFailure(testCase.caseId, cause);
			failures.push(failure);
			options?.report?.(
				Object.freeze({
					caseId: testCase.caseId,
					status: RpcConformanceStatusEnum.failed,
					error: failure,
				}),
			);
		}
	}

	if (failures.length > 0) {
		throw new AggregateError(failures, "RPC conformance failed.");
	}
}

export function assertRpcConformance(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function createRpcConformanceFailure(
	caseId: string,
	cause: unknown,
): RpcConformanceFailure {
	const causeMessage = cause instanceof Error ? cause.message : String(cause);
	const failure = new Error(
		`${caseId}: ${causeMessage}`,
	) as RpcConformanceFailure;
	Object.defineProperties(failure, {
		name: { value: "RpcConformanceFailure", configurable: true },
		caseId: { value: caseId, enumerable: true },
		cause: { value: cause },
	});
	return failure;
}
