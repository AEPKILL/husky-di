/**
 * @overview Public caller-facing RPC Peer contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";

import type {
	IRemoteServiceDescriptor,
	RemoteService,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/interfaces/peer/remote-service-descriptor.interface";
import type { RpcPeerState } from "@/types/rpc-caller.type";

export interface IRpcPeer {
	readonly state: RpcPeerState;
	readonly state$: Observable<RpcPeerState>;

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions>;
}
