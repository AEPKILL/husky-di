/**
 * @overview Private record types derived from the husky-di-rpc/1 Zod grammar.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { output, ZodType } from "zod";

import type { RpcApplicationValue } from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	rpcAckRecordSchema,
	rpcActiveRecordSchema,
	rpcBootstrapRequestSchema,
	rpcCallMessageSchema,
	rpcCancelMessageSchema,
	rpcControlRecordSchema,
	rpcErrorMessageSchema,
	rpcFreshAcceptSchema,
	rpcFreshRequestSchema,
	rpcJsonRecordSchema,
	rpcMessageEnvelopeSchema,
	rpcResultMessageSchema,
	rpcResumeAcceptSchema,
	rpcResumeOutcomeSchema,
	rpcResumeRejectSchema,
	rpcResumeRequestSchema,
	rpcSemanticMessageSchema,
	rpcWireErrorCodeSchema,
} from "@/utils/protocol/rpc-wire-grammar.util";

type RpcReadonly<TValue> = RpcApplicationValue extends TValue
	? TValue
	: TValue extends readonly unknown[]
		? { readonly [TIndex in keyof TValue]: RpcReadonly<TValue[TIndex]> }
		: TValue extends object
			? { readonly [TKey in keyof TValue]: RpcReadonly<TValue[TKey]> }
			: TValue;

type RpcSchemaOutput<TSchema extends ZodType> = RpcReadonly<output<TSchema>>;

export type RpcJsonRecord = RpcSchemaOutput<typeof rpcJsonRecordSchema>;

export type RpcJsonValue = RpcApplicationValue;

export type RpcFreshRequest = RpcSchemaOutput<typeof rpcFreshRequestSchema>;

export type RpcFreshAccept = RpcSchemaOutput<typeof rpcFreshAcceptSchema>;

export type RpcResumeRequest = RpcSchemaOutput<typeof rpcResumeRequestSchema>;

export type RpcBootstrapRequest = RpcSchemaOutput<
	typeof rpcBootstrapRequestSchema
>;

export type RpcResumeAccept = RpcSchemaOutput<typeof rpcResumeAcceptSchema>;

export type RpcResumeReject = RpcSchemaOutput<typeof rpcResumeRejectSchema>;

export type RpcResumeOutcome = RpcSchemaOutput<typeof rpcResumeOutcomeSchema>;

export type RpcCallMessage = RpcSchemaOutput<typeof rpcCallMessageSchema>;

export type RpcCancelMessage = RpcSchemaOutput<typeof rpcCancelMessageSchema>;

export type RpcResultMessage = RpcSchemaOutput<typeof rpcResultMessageSchema>;

export type RpcWireErrorCode = RpcSchemaOutput<typeof rpcWireErrorCodeSchema>;

export type RpcErrorMessage = RpcSchemaOutput<typeof rpcErrorMessageSchema>;

export type RpcSemanticMessage = RpcSchemaOutput<
	typeof rpcSemanticMessageSchema
>;

export type RpcMessageEnvelope = RpcSchemaOutput<
	typeof rpcMessageEnvelopeSchema
>;

export type RpcAckRecord = RpcSchemaOutput<typeof rpcAckRecordSchema>;

export type RpcControlRecord = RpcSchemaOutput<typeof rpcControlRecordSchema>;

export type RpcActiveRecord = RpcSchemaOutput<typeof rpcActiveRecordSchema>;
