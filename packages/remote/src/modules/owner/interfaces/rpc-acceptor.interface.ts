/**
 * @overview Public caller-facing RPC Acceptor contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type { RpcAcceptorState } from "@/modules/owner/types/rpc-owner-state.type";
import type {
	IRpcPeer,
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/modules/peer";
import type { IRpcAcceptorAdapter } from "@/modules/transport";

export interface IRpcAcceptor {
	readonly state: RpcAcceptorState;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: RemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	listen(adapter: IRpcAcceptorAdapter): Promise<void>;

	shutdown(): Promise<void>;
	close(): Promise<void>;
}
