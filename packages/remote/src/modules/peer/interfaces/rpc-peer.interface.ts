/**
 * @overview Public caller-facing RPC Peer contract.
 * @author AEPKILL
 * @created 2026-09-07 23:22:09
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";
import type {
	RemoteService,
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMemberDefinitions,
} from "@/modules/peer/types/remote-service-descriptor.type";
import type { RpcPeerState } from "@/modules/peer/types/rpc-peer-state.type";

export interface IRpcPeer {
	readonly state: RpcPeerState;
	readonly state$: Observable<RpcPeerState>;

	expose<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: RemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	resolve<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: RemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions>;
}
