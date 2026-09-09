/**
 * @overview Safely inspects untrusted Protocol call records without invoking payload accessors.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	rpcCallOutcomeSchema,
	rpcHandlerTerminalSchema,
	rpcIncomingCallRequestSchema,
	rpcUnknownTerminalSchema,
} from "@/modules/peer/schemas/rpc-protocol-call.schema";
import type {
	IRpcProtocolCallRequest,
	RpcCallOutcome,
	RpcCallTerminalTypeEnum,
	RpcIncomingTerminal,
	RpcUnknownCallFailure,
} from "@/modules/protocol";
import type { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export function isRpcCallOutcome(value: unknown): value is RpcCallOutcome {
	const fields = readProtocolFields(value);
	return fields !== undefined && rpcCallOutcomeSchema.safeParse(fields).success;
}

export function isExpectedUnknownTerminal(
	value: unknown,
	code: RpcUnknownCallFailure,
): value is RpcIncomingTerminal {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined &&
		rpcUnknownTerminalSchema.safeParse(fields).success &&
		fields.fields.code === code
	);
}

export function isHandlerTerminal(value: unknown): value is RpcHandlerTerminal {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined && rpcHandlerTerminalSchema.safeParse(fields).success
	);
}

export function isIncomingCallRequest(
	value: unknown,
): value is IRpcProtocolCallRequest {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined &&
		rpcIncomingCallRequestSchema.safeParse(fields).success
	);
}

interface IProtocolFieldsSnapshot {
	readonly fieldNames: readonly string[];
	readonly fields: Readonly<Record<string, unknown>>;
}

type RpcHandlerTerminal =
	| Exclude<
			RpcIncomingTerminal,
			{ readonly type: RpcCallTerminalTypeEnum.failed }
	  >
	| {
			readonly type: RpcCallTerminalTypeEnum.failed;
			readonly code:
				| RpcExceptionCodeEnum.canceled
				| RpcExceptionCodeEnum.handlerFailed;
	  };

function readProtocolFields(
	value: unknown,
): IProtocolFieldsSnapshot | undefined {
	try {
		if (typeof value !== "object" || value === null) {
			return undefined;
		}
		const prototype = Reflect.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			return undefined;
		}
		const fieldNames: string[] = [];
		const fields = Object.create(null) as Record<string, unknown>;
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") {
				return undefined;
			}
			const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
			if (descriptor === undefined || !("value" in descriptor)) {
				return undefined;
			}
			fieldNames.push(key);
			fields[key] = descriptor.value;
		}
		return { fieldNames, fields };
	} catch {
		return undefined;
	}
}
