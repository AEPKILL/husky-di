/**
 * @overview Defines the package-private Zod grammar for decoded husky-di-rpc/1 records.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { z } from "zod";

import { RPC_PROFILE } from "@/constants/protocol/rpc-profile.const";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcApplicationRecord,
	RpcApplicationValue,
} from "@/interfaces/protocol/rpc-protocol.interface";
import { rpcBase64Url32Schema } from "@/utils/protocol/rpc-base64-url-32-schema.util";
import { rpcWireIdentifierSchema } from "@/utils/protocol/rpc-wire-identifier-schema.util";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
} from "@/utils/rpc-application-value.util";
import {
	isArray,
	isNonNegativeSafeInteger,
	isNonNullObject,
	isPositiveSafeInteger,
} from "@/utils/type-guard.util";

export {
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
};

const callOrdinalPattern = /^(?:[1-9][0-9]{0,15})$/;
const closeForbiddenMembers = new Set([
	"seq",
	"ackThrough",
	"profile",
	"profiles",
	"sessionId",
	"bindingEpoch",
	"resumeAttempt",
	"receivedThrough",
	"resumeToken",
	"callId",
	"service",
	"method",
	"args",
	"value",
	"error",
	"code",
	"message",
	"reason",
]);
function applicationValueIsValid(value: unknown): value is RpcApplicationValue {
	try {
		normalizeRpcApplicationValue(value);
		return true;
	} catch {
		return false;
	}
}

function applicationArgumentsAreValid(
	value: unknown,
): value is readonly RpcApplicationValue[] {
	try {
		normalizeRpcApplicationArguments(value);
		return true;
	} catch {
		return false;
	}
}

const decodedJsonValueSchema = z.json();
const rpcJsonValueSchema = z.custom<RpcApplicationValue>(
	(value) => decodedJsonValueSchema.safeParse(value).success,
);
const rpcApplicationValueSchema = z.custom<RpcApplicationValue>(
	applicationValueIsValid,
);
const rpcApplicationArgumentsSchema = z.custom<readonly RpcApplicationValue[]>(
	applicationArgumentsAreValid,
);
const positiveSafeIntegerSchema = z.custom<number>(isPositiveSafeInteger);
const nonNegativeSafeIntegerSchema = z.custom<number>(isNonNegativeSafeInteger);
const rpcCallOrdinalSchema = z
	.string()
	.regex(callOrdinalPattern)
	.refine((value) => Number.isSafeInteger(Number(value)));
const rpcProfileOfferSchema = z
	.array(rpcWireIdentifierSchema)
	.min(1)
	.refine((profiles) => new Set(profiles).size === profiles.length);

const rpcJsonRecordSchema = z.custom<IRpcApplicationRecord>(
	(value) => isNonNullObject(value) && !isArray(value),
);

const rpcWireErrorCodeSchema = z.enum([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMethod,
]);

const rpcWireErrorShapeSchema = z.object({
	code: rpcWireErrorCodeSchema,
	message: z.string(),
	details: rpcApplicationValueSchema.optional(),
});
const wireErrorMemberNames = new Set(
	Object.keys(rpcWireErrorShapeSchema.shape),
);

const rpcWireErrorSchema = z
	.custom<z.output<typeof rpcWireErrorShapeSchema>>(
		(value) =>
			typeof value === "object" && value !== null && !Array.isArray(value),
		{ error: "RPC error payload must be an object." },
	)
	.superRefine((value, context) => {
		const containsUnknownMember = Reflect.ownKeys(value).some(
			(key) => typeof key !== "string" || !wireErrorMemberNames.has(key),
		);
		if (containsUnknownMember) {
			context.addIssue({
				code: "custom",
				message: "RPC error payload contains an unknown member.",
			});
			return;
		}

		const result = rpcWireErrorShapeSchema.safeParse(value);
		if (!result.success) {
			for (const issue of result.error.issues) {
				context.addIssue({
					code: "custom",
					message: issue.message,
					path: issue.path,
				});
			}
		}
	});

const rpcFreshRequestSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.fresh),
		profiles: rpcProfileOfferSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcFreshAcceptSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.accept),
		profile: z.literal(RPC_PROFILE),
		sessionId: rpcBase64Url32Schema,
		bindingEpoch: z.literal(1),
		resumeToken: rpcBase64Url32Schema,
	})
	.catchall(rpcJsonValueSchema)
	.refine((record) => !Object.hasOwn(record, "receivedThrough"));

const rpcResumeRequestSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.resume),
		profile: rpcWireIdentifierSchema,
		sessionId: rpcBase64Url32Schema,
		resumeToken: rpcBase64Url32Schema,
		receivedThrough: nonNegativeSafeIntegerSchema,
		resumeAttempt: positiveSafeIntegerSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcResumeAcceptSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.accept),
		profile: rpcWireIdentifierSchema,
		sessionId: rpcBase64Url32Schema,
		bindingEpoch: positiveSafeIntegerSchema,
		receivedThrough: nonNegativeSafeIntegerSchema,
	})
	.catchall(rpcJsonValueSchema)
	.refine((record) => !Object.hasOwn(record, "resumeToken"));

const rpcResumeRejectSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.reject),
		code: z.enum([
			RpcResumeRejectCodeEnum.resumeRejected,
			RpcResumeRejectCodeEnum.continuityFailure,
			RpcResumeRejectCodeEnum.sessionTerminated,
		]),
	})
	.catchall(rpcJsonValueSchema)
	.refine((record) => !Object.hasOwn(record, "message"));

const rpcCallMessageSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.call),
		callId: rpcCallOrdinalSchema,
		service: rpcWireIdentifierSchema,
		method: rpcWireIdentifierSchema.refine((method) => method !== "then"),
		args: rpcApplicationArgumentsSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcCancelMessageSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.cancel),
		callId: rpcCallOrdinalSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcResultMessageSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.result),
		callId: rpcCallOrdinalSchema,
		value: rpcApplicationValueSchema.optional(),
	})
	.catchall(rpcJsonValueSchema);

const rpcErrorMessageSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.error),
		callId: rpcCallOrdinalSchema,
		error: rpcWireErrorSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcSemanticMessageSchema = z.discriminatedUnion("kind", [
	rpcCallMessageSchema,
	rpcCancelMessageSchema,
	rpcResultMessageSchema,
	rpcErrorMessageSchema,
]);

const rpcMessageEnvelopeSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.message),
		seq: positiveSafeIntegerSchema,
		ackThrough: nonNegativeSafeIntegerSchema.optional(),
		message: rpcSemanticMessageSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcAckRecordSchema = z
	.object({
		kind: z.literal(RpcWireRecordKindEnum.ack),
		ackThrough: nonNegativeSafeIntegerSchema,
	})
	.catchall(rpcJsonValueSchema);

const rpcPingRecordSchema = z
	.object({ kind: z.literal(RpcWireRecordKindEnum.ping) })
	.catchall(rpcJsonValueSchema);
const rpcPongRecordSchema = z
	.object({ kind: z.literal(RpcWireRecordKindEnum.pong) })
	.catchall(rpcJsonValueSchema);
const rpcCloseRecordSchema = z
	.object({ kind: z.literal(RpcWireRecordKindEnum.close) })
	.catchall(rpcJsonValueSchema)
	.superRefine((record, context) => {
		if (Object.keys(record).some((key) => closeForbiddenMembers.has(key))) {
			context.addIssue({
				code: "custom",
				message: "RPC close contains a forbidden control member.",
			});
		}
	});

const rpcControlRecordSchema = z.discriminatedUnion("kind", [
	rpcPingRecordSchema,
	rpcPongRecordSchema,
	rpcCloseRecordSchema,
]);

const rpcBootstrapRequestSchema = z.discriminatedUnion("kind", [
	rpcFreshRequestSchema,
	rpcResumeRequestSchema,
]);

const rpcResumeOutcomeSchema = z.discriminatedUnion("kind", [
	rpcResumeAcceptSchema,
	rpcResumeRejectSchema,
]);

const rpcActiveRecordSchema = z.discriminatedUnion("kind", [
	rpcMessageEnvelopeSchema,
	rpcAckRecordSchema,
	rpcPingRecordSchema,
	rpcPongRecordSchema,
	rpcCloseRecordSchema,
]);
