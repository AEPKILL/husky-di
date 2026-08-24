/**
 * @overview Defines package-private Zod schemas for RPC runtime boundaries.
 * @author AEPKILL
 * @created 2026-08-22 18:55:00
 */

import { z } from "zod";

import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcStreamWireErrorCode,
	RpcWireErrorCode,
} from "@/types/protocol/rpc-wire-record.type";
import {
	isRpcApplicationArgumentsSnapshot,
	isRpcApplicationSnapshot,
} from "@/utils/rpc-application-value.util";

const textEncoder = new TextEncoder();
const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const callOrdinalPattern = /^(?:[1-9][0-9]{0,15})$/;
const maximumIdentifierBytes = 256;
const maximumPlatformTimerDelayMs = 2_147_483_647;

export const rpcNonNullObjectSchema = z.custom<object>(
	(value) => typeof value === "object" && value !== null,
);

export const rpcObjectTypeSchema = z.custom<object | null>(
	(value) => typeof value === "object",
);

export const rpcNullSchema = z.null();

export const rpcObjectOrFunctionSchema = z.custom<object>(
	(value) =>
		(typeof value === "object" && value !== null) ||
		typeof value === "function",
);

export const rpcCallableSchema = z.function();
export const rpcArrayBrandSchema = z.custom<readonly unknown[]>(Array.isArray);
export const rpcUndefinedSchema = z.undefined();
export const rpcStringSchema = z.string();
export const rpcPositiveSafeIntegerSchema = z.int().positive();
export const rpcNonNegativeSafeIntegerSchema = z.int().nonnegative();

export const rpcDescriptorPlainRecordSchema = z.custom<
	Record<PropertyKey, unknown>
>((value) => {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
});

export const rpcClosedOptionsPlainRecordSchema = z.custom<
	Record<PropertyKey, unknown>
>((value) => {
	// Closed option bags must be non-null records rather than arrays.
	const isNotRecord =
		typeof value !== "object" || value === null || Array.isArray(value);
	if (isNotRecord) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
});

export const rpcWireIdentifierSchema = z
	.string()
	.min(1)
	.refine(
		(value) => textEncoder.encode(value).byteLength <= maximumIdentifierBytes,
	);

export const rpcCancelableMethodDefinitionSchema = z.strictObject({
	cancelable: z.literal(true),
});

export const rpcRetryDelayCountSchema = z.int().min(0).max(64);
export const rpcRetryDelaySchema = rpcNonNegativeSafeIntegerSchema;
export const rpcJsonRecordSchema = z.record(z.string(), z.unknown());
export const rpcJsonArraySchema = z.array(z.unknown());
export const rpcNonEmptyJsonArraySchema = rpcJsonArraySchema.min(1);
export const rpcBase64Url32Schema = z.string().regex(base64Url32Pattern);
export const rpcCallOrdinalSchema = z.string().regex(callOrdinalPattern);
export const rpcStreamOrdinalSchema = rpcCallOrdinalSchema;
export const rpcFirstBindingEpochSchema = z.literal(1);

export const rpcWireErrorCodeSchema = z.enum([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMember,
] satisfies readonly RpcWireErrorCode[]);

export const rpcStreamWireErrorCodeSchema = z.enum([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMember,
	RpcExceptionCodeEnum.overflow,
] satisfies readonly RpcStreamWireErrorCode[]);

export const rpcResumeRejectCodeSchema = z.enum([
	RpcResumeRejectCodeEnum.resumeRejected,
	RpcResumeRejectCodeEnum.continuityFailure,
	RpcResumeRejectCodeEnum.sessionTerminated,
]);

export const rpcErrorPayloadMemberNamesSchema = z.array(
	z.enum(["code", "message"]),
);

export const rpcProfileOfferSchema = z
	.array(rpcWireIdentifierSchema)
	.min(1)
	.refine((profiles) => new Set(profiles).size === profiles.length);

export const rpcByteMessageSchema = z.instanceof(Uint8Array);
export const rpcPlatformTimerDelaySchema = z
	.int()
	.positive()
	.max(maximumPlatformTimerDelayMs);

export const rpcApplicationSnapshotSchema = z.custom<IRpcApplicationSnapshot>(
	isRpcApplicationSnapshot,
);

export const rpcApplicationArgumentsSnapshotSchema =
	z.custom<IRpcApplicationArgumentsSnapshot>(isRpcApplicationArgumentsSnapshot);

export const rpcOutgoingFailureCodeSchema = z.enum([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.outcomeUnknown,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMethod,
]);

export const rpcTypeOnlyFieldNamesSchema = z.array(z.literal("type")).length(1);
export const rpcTypeValueFieldNamesSchema = z
	.array(z.enum(["type", "value"]))
	.length(2);
export const rpcTypeCodeFieldNamesSchema = z
	.array(z.enum(["type", "code"]))
	.length(2);
export const rpcIncomingCallFieldNamesSchema = z
	.array(z.enum(["service", "method", "args"]))
	.length(3);

export const rpcCallOutcomeSchema = z.union([
	z.object({
		fieldNames: rpcTypeOnlyFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.returnedVoid),
		}),
	}),
	z.object({
		fieldNames: rpcTypeValueFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.returned),
			value: rpcApplicationSnapshotSchema,
		}),
	}),
	z.object({
		fieldNames: rpcTypeCodeFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.failed),
			code: rpcOutgoingFailureCodeSchema,
		}),
	}),
]);

export const rpcHandlerTerminalSchema = z.union([
	z.object({
		fieldNames: rpcTypeOnlyFieldNamesSchema,
		fields: z.object({
			type: z.enum([
				RpcCallTerminalTypeEnum.sessionTerminated,
				RpcCallTerminalTypeEnum.returnedVoid,
			]),
		}),
	}),
	z.object({
		fieldNames: rpcTypeValueFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.returned),
			value: rpcApplicationSnapshotSchema,
		}),
	}),
	z.object({
		fieldNames: rpcTypeCodeFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.failed),
			code: z.enum([
				RpcExceptionCodeEnum.canceled,
				RpcExceptionCodeEnum.handlerFailed,
			]),
		}),
	}),
]);

export const rpcIncomingCallRequestSchema = z.object({
	fieldNames: rpcIncomingCallFieldNamesSchema,
	fields: z.object({
		service: z.string().min(1),
		method: z
			.string()
			.min(1)
			.refine((method) => method !== "then"),
		args: rpcApplicationArgumentsSnapshotSchema,
	}),
});

export function createRpcProtocolObjectSchema(methodNames: readonly string[]) {
	return z.unknown().superRefine((value, context) => {
		if (!rpcNonNullObjectSchema.safeParse(value).success) {
			context.addIssue({ code: "custom", message: "Expected an object." });
			return;
		}
		const protocolObject = value as object;
		for (const methodName of methodNames) {
			if (
				!rpcCallableSchema.safeParse(Reflect.get(protocolObject, methodName))
					.success
			) {
				context.addIssue({
					code: "custom",
					message: `Expected ${methodName} to be callable.`,
				});
				return;
			}
		}
	});
}

export const rpcInvocationReservationSchema = createRpcProtocolObjectSchema([
	"commit",
	"release",
]);

export const rpcCommittedInvocationSchema = createRpcProtocolObjectSchema([
	"start",
	"cancel",
]);

export function createRpcExpectedUnknownTerminalSchema(
	code: RpcUnknownCallFailure,
) {
	return z.object({
		fieldNames: rpcTypeCodeFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.failed),
			code: z.literal(code),
		}),
	});
}
