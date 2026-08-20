/**
 * @overview Public framework-neutral RPC conformance result types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcConformanceStatusEnum } from "@/enums/conformance/rpc-conformance-status.enum";

export type RpcConformanceFailure = Error & {
	readonly caseId: string;
};

export type RpcConformanceCaseResult =
	| {
			readonly caseId: string;
			readonly status: RpcConformanceStatusEnum.passed;
	  }
	| {
			readonly caseId: string;
			readonly status: RpcConformanceStatusEnum.failed;
			readonly error: RpcConformanceFailure;
	  };

export type RpcConformanceReport = (result: RpcConformanceCaseResult) => void;

export type RpcConformanceOptions = {
	readonly report?: RpcConformanceReport;
};
