/**
 * @overview Compile-time call interceptor context and Owner option contracts.
 * @author AEPKILL
 * @created 2026-09-12 02:38:04
 */

import { type Observable, of } from "rxjs";
import { assertType, expectTypeOf, test } from "vitest";
import {
	createRpcAcceptor,
	createRpcConnector,
	type IRpcApplicationRecord,
	type IRpcPeer,
	type RpcAcceptorOptions,
	type RpcCallContext,
	RpcCallDirectionEnum,
	type RpcConnectorOptions,
	type RpcInterceptor,
} from "../../src/index";

test("RPC-INTERCEPT-001 exposes a typed optional interceptor on both Owner factories", () => {
	// @ts-expect-error RPC-STREAM-008 removes the old public type name.
	type RemovedInterceptor = import("../../src/index").RpcCallInterceptor;
	void (null as unknown as RemovedInterceptor);
	const interceptor: RpcInterceptor = (context, next) => {
		expectTypeOf(context).toEqualTypeOf<RpcCallContext>();
		expectTypeOf(context.peer).toEqualTypeOf<IRpcPeer>();
		expectTypeOf(context.service).toEqualTypeOf<string>();
		expectTypeOf(context.method).toEqualTypeOf<string>();
		expectTypeOf(context.metadata).toEqualTypeOf<IRpcApplicationRecord>();
		expectTypeOf(next).toEqualTypeOf<() => Observable<unknown>>();
		if (context.direction === RpcCallDirectionEnum.outgoing) {
			context.metadata = { ...context.metadata, traceId: "trace" };
			expectTypeOf(context.signal).toEqualTypeOf<AbortSignal | undefined>();
		} else {
			expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
			// @ts-expect-error Incoming metadata is an immutable received snapshot.
			context.metadata = { traceId: "replacement" };
		}
		// @ts-expect-error Application records preserve readonly property access.
		context.metadata.traceId = "changed";
		// @ts-expect-error Interception cannot reroute the selected service.
		context.service = "other";
		// @ts-expect-error Interception cannot replace the call direction.
		context.direction = RpcCallDirectionEnum.incoming;
		// @ts-expect-error Business arguments remain outside the interception API.
		void context.args;
		return next();
	};
	createRpcConnector({ interceptor: interceptor });
	createRpcAcceptor({ interceptor: interceptor });
	assertType<RpcInterceptor>(() => of(42));
	// @ts-expect-error RPC-STREAM-008 interceptors must return Observable.
	assertType<RpcInterceptor>(() => 42);
	// @ts-expect-error RPC-STREAM-008 Promise continuation is not supported.
	assertType<RpcInterceptor>(async () => 42);
	// @ts-expect-error RPC-STREAM-008 removes the old Owner option.
	createRpcConnector({ callInterceptor: interceptor });
	// @ts-expect-error RPC-STREAM-008 rejects mixed old/new options.
	createRpcAcceptor({ interceptor, callInterceptor: interceptor });
	assertType<RpcConnectorOptions>({ interceptor: undefined });
	assertType<RpcAcceptorOptions>({ interceptor: undefined });
	expectTypeOf<RpcConnectorOptions["interceptor"]>().toEqualTypeOf<
		RpcInterceptor | undefined
	>();
	expectTypeOf<RpcAcceptorOptions["interceptor"]>().toEqualTypeOf<
		RpcInterceptor | undefined
	>();
});
