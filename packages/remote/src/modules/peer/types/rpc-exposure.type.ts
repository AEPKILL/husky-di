/**
 * @overview Private validated RPC exposure route and registry types.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27 17:54:40
 */

import type { Observable } from "rxjs";
import type { RpcMemberKind } from "@/modules/peer/types/remote-service-descriptor.type";

export type RpcHandlerRoute = Readonly<{
	readonly implementation: object;
	readonly handler: (...args: unknown[]) => unknown;
	readonly cancelable: boolean;
	readonly kind: RpcMemberKind;
	readonly observable?: Observable<unknown>;
}>;

export type RpcExposure = Readonly<{
	readonly wireName: string;
	readonly members: ReadonlyMap<string, RpcHandlerRoute>;
}>;

export type RpcExposureRegistry = Map<string, RpcExposure>;
