/**
 * @overview Invokes captured handlers and normalizes their settled results without retaining canceled payloads.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import { defer, from } from "rxjs";
import type { RpcCallDirectionEnum } from "@/modules/peer/enums/rpc-call-direction.enum";
import type {
	RpcCallContext,
	RpcInterceptor,
} from "@/modules/peer/types/rpc-call-interceptor.type";
import type { RpcHandlerRoute } from "@/modules/peer/types/rpc-exposure.type";
import {
	interceptRpcCall,
	resolveRpcUnary,
} from "@/modules/peer/utils/rpc-call-interceptor.util";
import type {
	IRpcApplicationArgumentsSnapshot,
	RpcHandlerOutcome,
} from "@/modules/protocol";
import {
	normalizeRpcApplicationValue,
	RpcCallTerminalTypeEnum,
} from "@/modules/protocol";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";

export function processRpcHandlerCall(options: {
	readonly route: RpcHandlerRoute;
	readonly argumentsSnapshot: IRpcApplicationArgumentsSnapshot;
	readonly context: Extract<
		RpcCallContext,
		{ readonly direction: RpcCallDirectionEnum.incoming }
	>;
	readonly interceptor: RpcInterceptor | undefined;
	readonly isSettled: () => boolean;
	readonly resolve: (outcome: RpcHandlerOutcome) => void;
}): Promise<void> {
	const { route, argumentsSnapshot, context, interceptor, isSettled, resolve } =
		options;
	if (interceptor === undefined) {
		let result: unknown;
		try {
			result = invokeRpcHandler(route, argumentsSnapshot, context.signal);
		} catch {
			resolve({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.handlerFailed,
			});
			return Promise.resolve();
		}
		return processRpcHandlerResult(result, isSettled, resolve);
	}
	let handlerExecution: Promise<unknown> | undefined;
	const result = interceptRpcCall(interceptor, context, () => {
		if (isSettled()) {
			throw createRpcException(RpcExceptionCodeEnum.canceled);
		}
		return defer(() => {
			handlerExecution = Promise.try(
				invokeRpcHandler,
				route,
				argumentsSnapshot,
				context.signal,
			);
			void handlerExecution.catch(() => undefined);
			return from(handlerExecution);
		});
	});
	// A wrapper can select an earlier result, but cannot release a running handler's permits.
	return processRpcHandlerResult(
		resolveRpcUnary(result),
		isSettled,
		resolve,
	).finally(() =>
		handlerExecution?.then(
			() => undefined,
			() => undefined,
		),
	);
}

function invokeRpcHandler(
	route: RpcHandlerRoute,
	argumentsSnapshot: IRpcApplicationArgumentsSnapshot,
	abortSignal: AbortSignal,
): unknown {
	const invocationArguments: unknown[] = [...argumentsSnapshot.value];
	if (route.cancelable) {
		invocationArguments.push(abortSignal);
	}
	return Reflect.apply(
		route.handler,
		route.implementation,
		invocationArguments,
	);
}

function processRpcHandlerResult(
	result: unknown,
	isSettled: () => boolean,
	resolve: (outcome: RpcHandlerOutcome) => void,
): Promise<void> {
	const assimilation = new Promise<unknown>((resolve) => resolve(result));
	return assimilation.then(
		(value) => {
			if (isSettled()) {
				resolve({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.handlerFailed,
				});
				return;
			}
			try {
				if (value === undefined) {
					resolve({
						type: RpcCallTerminalTypeEnum.returnedVoid,
					});
				} else {
					const snapshot = normalizeRpcApplicationValue(value);
					if (isSettled()) {
						resolve({
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.handlerFailed,
						});
						return;
					}
					resolve({
						type: RpcCallTerminalTypeEnum.returned,
						value: snapshot,
					});
				}
			} catch {
				resolve({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.handlerFailed,
				});
			}
		},
		() => {
			resolve({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.handlerFailed,
			});
		},
	);
}
