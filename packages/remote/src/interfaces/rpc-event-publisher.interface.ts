/**
 * @overview Private RPC event publication boundary.
 * @author AEPKILL
 * @created 2026-08-24 23:36:00
 */

import type { Observable } from "rxjs";

import type { RpcEvent } from "@/interfaces/rpc-caller.interface";

/** Serializes Owner events while their generation remains authoritative. */
export interface IRpcEventPublisher {
	readonly event$: Observable<RpcEvent>;
	publish(event: RpcEvent, isAuthorized?: () => boolean): void;
	complete(): void;
}
