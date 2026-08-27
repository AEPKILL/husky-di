/**
 * @overview Public caller-facing RPC Acceptor contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";

import type {
	IRemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/interfaces/peer/remote-service-descriptor.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type { RpcAcceptorState } from "@/types/rpc-caller.type";

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

	shutdown(): Promise<void>;
	close(): Promise<void>;
}
