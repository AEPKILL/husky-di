/**
 * @overview Private validated RPC exposure route and registry types.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

export type RpcHandlerRoute = Readonly<{
	readonly implementation: object;
	readonly handler: (...args: unknown[]) => unknown;
	readonly cancelable: boolean;
}>;

export type RpcExposure = Readonly<{
	readonly wireName: string;
	readonly methods: ReadonlyMap<string, RpcHandlerRoute>;
}>;

export type RpcExposureRegistry = Map<string, RpcExposure>;
