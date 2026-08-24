/**
 * @overview Creates one package-private RPC Source Subscription adapter.
 * @author AEPKILL
 * @created 2026-08-24 22:31:00
 */

import { RpcSourceSubscriptionImpl } from "@/impls/rpc-source-subscription.impl";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolSourceSink,
	RpcIncomingStreamTerminal,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcStreamRoute } from "@/types/rpc-exposure.type";

/** Binds one captured route to its one-shot Source lifecycle. */
export function createRpcSourceSubscription(
	route: RpcStreamRoute,
	argumentsSnapshot: IRpcApplicationArgumentsSnapshot | undefined,
	source: IRpcProtocolSourceSink,
	onProtocolFault: (error: unknown) => void,
	releaseSourceRoot: () => void,
	onFinished: (
		outcome: RpcIncomingStreamTerminal,
		finishedAt: number,
		admittedItemCount: number,
		sourceTeardownFailed: boolean,
	) => void,
): RpcSourceSubscriptionImpl {
	return new RpcSourceSubscriptionImpl(
		route,
		argumentsSnapshot,
		source,
		onProtocolFault,
		releaseSourceRoot,
		onFinished,
	);
}
