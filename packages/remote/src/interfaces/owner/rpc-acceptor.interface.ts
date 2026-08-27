/**
 * @overview Public caller-facing RPC Acceptor contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";

import type { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import type { RpcException } from "@/exceptions/rpc.exception";
import type {
	AnyMethod,
	IRemoteServiceDescriptor,
	IsCancelableMethod,
	RemoteMethodKey,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
	SelectedMethodKey,
} from "@/interfaces/peer/remote-service-descriptor.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type { RpcAcceptorState } from "@/types/rpc-caller.type";

export type RpcPeerResult<T> =
	| {
			readonly peer: IRpcPeer;
			readonly status: RpcCallStatusEnum.fulfilled;
			readonly value: T;
	  }
	| {
			readonly peer: IRpcPeer;
			readonly status: RpcCallStatusEnum.rejected;
			readonly reason: RpcException;
	  };

type RemoteGroupMethod<F, Definition> = F extends (
	...args: infer Arguments
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Arguments extends [...infer Parameters, AbortSignal]
			? (
					...args: [...Parameters, signal: AbortSignal | undefined]
				) => Promise<readonly RpcPeerResult<Awaited<Result>>[]>
			: never
		: (...args: Arguments) => Promise<readonly RpcPeerResult<Awaited<Result>>[]>
	: never;

export type RemoteServiceGroup<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteGroupMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
} & { readonly then?: never };

export interface IRpcAcceptor {
	readonly state: RpcAcceptorState;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	listen(adapter: IRpcAcceptorAdapter): Promise<void>;

	resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteServiceGroup<T, Definitions>;

	shutdown(): Promise<void>;
	close(): Promise<void>;
}
