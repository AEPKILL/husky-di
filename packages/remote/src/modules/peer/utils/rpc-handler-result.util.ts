/**
 * @overview Invokes captured handlers and normalizes their settled results without retaining canceled payloads.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { RpcHandlerRoute } from "@/modules/peer/types/rpc-exposure.type";
import type {
	IRpcApplicationArgumentsSnapshot,
	RpcHandlerOutcome,
} from "@/modules/protocol";
import {
	normalizeRpcApplicationValue,
	RpcCallTerminalTypeEnum,
} from "@/modules/protocol";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export function invokeRpcHandler(
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

export function processRpcHandlerResult(
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
