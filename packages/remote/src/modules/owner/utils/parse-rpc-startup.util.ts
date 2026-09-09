/**
 * @overview Validates startup inputs after Owner admission and preserves Adapter capability snapshots.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { Observable } from "rxjs";
import {
	type RpcConnectorConnectOptions,
	rpcConnectorAdapterMembersSchema,
	rpcConnectorCallableSchema,
	rpcConnectorConnectOptionsSchema,
	rpcConnectorObservableSchema,
} from "@/modules/owner/types/rpc-caller.type";
import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "@/modules/transport";
import {
	isCallable,
	isNonNullObject,
	isUndefined,
} from "@/shared/utils/type-guard.util";

export function parseRpcConnectorStartup(options: RpcConnectorConnectOptions) {
	const optionsResult = rpcConnectorConnectOptionsSchema.safeParse(options);
	if (!optionsResult.success) {
		throw new TypeError(optionsResult.error.message, {
			cause: optionsResult.error,
		});
	}
	const optionRecord = optionsResult.data;
	const signal = optionRecord.signal?.signal;
	if (optionRecord.signal?.aborted === true) {
		throw new DOMException("The connection attempt was aborted.", "AbortError");
	}
	const adapterResult = rpcConnectorAdapterMembersSchema.safeParse(
		optionRecord.adapter,
	);
	if (!adapterResult.success) {
		throw new TypeError("adapter has an invalid shape.");
	}
	const { connect, connection$ } = adapterResult.data;
	const connectionSourceIsInvalid =
		!rpcConnectorObservableSchema.safeParse(connection$).success;
	const connectIsInvalid =
		!rpcConnectorCallableSchema.safeParse(connect).success;
	if (connectionSourceIsInvalid || connectIsInvalid) {
		throw new TypeError("adapter has an invalid shape.");
	}
	const adapter = optionRecord.adapter as IRpcConnectorAdapter;

	return {
		adapter,
		signal,
		connection$: connection$ as Observable<IRpcConnection>,
		connect: connect as IRpcConnectorAdapter["connect"],
	};
}

export function parseRpcAcceptorStartup(adapter: IRpcAcceptorAdapter) {
	if (!isNonNullObject(adapter)) {
		throw new TypeError("adapter must be an object.");
	}
	const connectionSource = Reflect.get(adapter, "connection$") as unknown;
	const listen = Reflect.get(adapter, "listen");
	const subscribe = isUndefined(connectionSource)
		? undefined
		: Reflect.get(connectionSource as object, "subscribe");
	// An Acceptor Adapter must provide callable subscription and listen entrypoints.
	const adapterShapeIsInvalid = !isCallable(subscribe) || !isCallable(listen);
	if (adapterShapeIsInvalid) {
		throw new TypeError("adapter has an invalid shape.");
	}

	return {
		connection$: connectionSource as Observable<IRpcConnection>,
		listen,
	};
}
