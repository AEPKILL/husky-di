/**
 * @overview Caller-facing call interception and directional metadata contracts.
 * @author AEPKILL
 * @created 2026-09-12 02:38:04
 */

import type { Observable } from "rxjs";
import type { RpcCallDirectionEnum } from "@/modules/peer/enums/rpc-call-direction.enum";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type { IRpcApplicationRecord } from "@/modules/protocol";

export type RpcCallContext = {
	readonly peer: IRpcPeer;
	readonly service: string;
	readonly method: string;
} & (
	| {
			readonly direction: RpcCallDirectionEnum.outgoing;
			readonly signal: AbortSignal | undefined;
			/** Replace before next() to attach application metadata. */
			metadata: IRpcApplicationRecord;
	  }
	| {
			readonly direction: RpcCallDirectionEnum.incoming;
			readonly signal: AbortSignal;
			readonly metadata: IRpcApplicationRecord;
	  }
);

/** Wraps one invocation; next() is revoked once Framework observes interceptor completion. */
export type RpcInterceptor = (
	context: RpcCallContext,
	next: () => Observable<unknown>,
) => Observable<unknown>;
