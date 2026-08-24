/**
 * @overview Private validated mixed-member RPC exposure route and registry types.
 * @author AEPKILL
 * @created 2026-08-24 00:00:00
 */

import type { Observable } from "rxjs";

export type RpcUnaryRoute = Readonly<{
	readonly kind: "unary";
	readonly implementation: object;
	readonly handler: (...args: unknown[]) => unknown;
	readonly cancelable: boolean;
}>;

export type RpcStreamMethodRoute = Readonly<{
	readonly kind: "stream-method";
	readonly implementation: object;
	readonly handler: (...args: unknown[]) => unknown;
}>;

export type RpcStreamPropertyRoute =
	| Readonly<{
			readonly kind: "stream-property";
			readonly sourceKind: "data";
			readonly source: Observable<unknown>;
	  }>
	| Readonly<{
			readonly kind: "stream-property";
			readonly sourceKind: "getter";
			readonly implementation: object;
			readonly getter: () => unknown;
	  }>;

export type RpcExposureRoute =
	| RpcUnaryRoute
	| RpcStreamMethodRoute
	| RpcStreamPropertyRoute;

export type RpcExposure = Readonly<{
	readonly wireName: string;
	readonly members: ReadonlyMap<string, RpcExposureRoute>;
}>;

export type RpcExposureRegistry = Map<string, RpcExposure>;

/** Current unary Protocol bridge route until the streaming SPI is implemented. */
export type RpcHandlerRoute = RpcUnaryRoute;
