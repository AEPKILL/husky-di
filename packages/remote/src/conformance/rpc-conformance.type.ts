/**
 * @overview Public RPC conformance types with their canonical options schema.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { type input, type output, z } from "zod";

import type { RpcConformanceStatusEnum } from "@/enums/conformance/rpc-conformance-status.enum";
import type {
	RpcProtocolAcceptorFactory,
	RpcProtocolConnectorFactory,
} from "@/types/protocol/rpc-protocol-factory.type";

export type RpcProtocolConformanceCandidate = Readonly<{
	readonly connector: RpcProtocolConnectorFactory;
	readonly acceptor: RpcProtocolAcceptorFactory;
}>;

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

export type RpcConformanceOptions = Readonly<
	input<typeof rpcConformanceOptionsSchema>
>;

export type RpcConformanceOptionsSnapshot = Readonly<
	output<typeof rpcConformanceOptionsSchema>
>;

export const rpcConformanceOptionsObjectSchema = z.strictObject({
	report: z
		.custom<RpcConformanceReport>((value) => typeof value === "function")
		.optional(),
});

export const rpcConformanceOptionsSchema = z
	.custom<input<typeof rpcConformanceOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcConformanceOptionsObjectSchema,
			ownKeys: z.array(rpcConformanceOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();
