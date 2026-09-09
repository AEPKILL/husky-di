/**
 * @overview Validates Framework-facing Protocol call records and prepared invocation controls.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { z } from "zod";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
} from "@/modules/protocol";
import {
	isRpcApplicationArgumentsSnapshot,
	isRpcApplicationSnapshot,
	RpcCallTerminalTypeEnum,
} from "@/modules/protocol";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { isCallable, isNonNullObject } from "@/shared/utils/type-guard.util";

export {
	rpcCallOutcomeSchema,
	rpcCommittedInvocationSchema,
	rpcHandlerTerminalSchema,
	rpcIncomingCallRequestSchema,
	rpcUnknownTerminalSchema,
};

const rpcApplicationSnapshotSchema = z.custom<IRpcApplicationSnapshot>(
	isRpcApplicationSnapshot,
);
const rpcApplicationArgumentsSnapshotSchema =
	z.custom<IRpcApplicationArgumentsSnapshot>(isRpcApplicationArgumentsSnapshot);
const rpcOutgoingFailureCodeSchema = z.enum([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.outcomeUnknown,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMethod,
]);
const rpcTypeOnlyFieldNamesSchema = z.array(z.literal("type")).length(1);
const rpcTypeValueFieldNamesSchema = z
	.array(z.enum(["type", "value"]))
	.length(2);
const rpcTypeCodeFieldNamesSchema = z.array(z.enum(["type", "code"])).length(2);
const rpcIncomingCallFieldNamesSchema = z
	.array(z.enum(["service", "method", "args"]))
	.length(3);
const rpcCallOutcomeSchema = z.union([
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
const rpcHandlerTerminalSchema = z.union([
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
const rpcIncomingCallRequestSchema = z.object({
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

const rpcCommittedInvocationSchema = z
	.unknown()
	.superRefine((value, context) => {
		if (!isNonNullObject(value)) {
			context.addIssue({ code: "custom", message: "Expected an object." });
			return;
		}
		const protocolObject = value as object;
		for (const methodName of ["start", "cancel"]) {
			if (!isCallable(Reflect.get(protocolObject, methodName))) {
				context.addIssue({
					code: "custom",
					message: `Expected ${methodName} to be callable.`,
				});
				return;
			}
		}
	});
const rpcUnknownTerminalSchema = z.object({
	fieldNames: rpcTypeCodeFieldNamesSchema,
	fields: z.object({
		type: z.literal(RpcCallTerminalTypeEnum.failed),
		code: z.enum([
			RpcExceptionCodeEnum.unknownService,
			RpcExceptionCodeEnum.unknownMethod,
		]),
	}),
});
