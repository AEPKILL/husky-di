/**
 * @overview Captures metadata and runs Observable interception with single-use continuations and unary cardinality.
 * @author AEPKILL
 * @created 2026-09-12 02:38:04
 */

import { defer, isObservable, lastValueFrom, map, Observable } from "rxjs";
import type {
	RpcCallContext,
	RpcInterceptor,
} from "@/modules/peer/types/rpc-call-interceptor.type";
import {
	type IRpcApplicationRecord,
	type IRpcApplicationSnapshot,
	normalizeRpcApplicationValue,
} from "@/modules/protocol";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";
import { installRpcAbortListener } from "@/shared/utils/rpc-cancellation.util";

/** Captures metadata at the continuation boundary and omits an empty record. */
export function normalizeRpcCallMetadata(
	value: unknown,
): IRpcApplicationSnapshot<IRpcApplicationRecord> | undefined {
	const snapshot = normalizeRpcApplicationValue(value);
	if (
		typeof snapshot.value !== "object" ||
		snapshot.value === null ||
		Array.isArray(snapshot.value)
	) {
		throw new TypeError("RPC metadata must be an Application Value record.");
	}
	return Object.keys(snapshot.value).length === 0
		? undefined
		: (snapshot as IRpcApplicationSnapshot<IRpcApplicationRecord>);
}

export function interceptRpcCall(
	interceptor: RpcInterceptor,
	context: RpcCallContext,
	invoke: () => Observable<unknown>,
): Observable<unknown> {
	return new Observable((subscriber) => {
		let available = true;
		const removeAbort =
			context.signal === undefined
				? undefined
				: installRpcAbortListener(context.signal, () => {
						subscriber.error(createRpcException(RpcExceptionCodeEnum.canceled));
					});
		subscriber.add(removeAbort);
		subscriber.add(() => {
			available = false;
		});
		if (subscriber.closed) return;
		const result = interceptor(context, () => {
			if (!available || subscriber.closed) {
				throw new TypeError("RPC next() is no longer available.");
			}
			available = false;
			const source = invoke();
			let subscribed = false;
			return defer(() => {
				if (subscribed || subscriber.closed)
					throw new TypeError("RPC continuation is no longer available.");
				subscribed = true;
				return new Observable((child) => {
					subscriber.add(child);
					if (!child.closed) source.subscribe(child);
				});
			});
		});
		if (!isObservable(result))
			throw new TypeError("RPC interceptor must return an Observable.");
		subscriber.add(result.subscribe(subscriber));
	});
}

/** Unary results complete with zero or one emission; a second emission terminates the source. */
export function resolveRpcUnary(source: Observable<unknown>): Promise<unknown> {
	let emitted = false;
	return lastValueFrom(
		source.pipe(
			map((value) => {
				if (emitted)
					throw createRpcException(RpcExceptionCodeEnum.handlerFailed);
				emitted = true;
				return value;
			}),
		),
		{ defaultValue: undefined },
	);
}
