/**
 * @overview Adapts the shared client to the public Node WebSocket adapter.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createNodeWebSocketConnectorAdapter } from "@husky-di/remote-websocket/node";
import type { ILabNodeContext } from "@husky-di/example-remote-lab/sdk";
import { createClient } from "./client";

export async function labNode(context: ILabNodeContext) {
	const factory = () =>
		createNodeWebSocketConnectorAdapter({
			url: String(context.parameters.endpoint),
		});
	return createClient(context, factory);
}
export {
	quote,
	inspect,
	setCallbackFailure,
	invalidValues,
	unknownMethod,
	capacity,
	startHeld,
	cancelHeld,
	heldOutcome,
	openStatic,
	closeStatic,
	staticSnapshot,
	echo,
	failure,
	callback,
	cancel,
	stream,
	cancelStream,
	drop,
	state,
	startDelayed,
	finishDelayed,
	shutdown,
	sourceConformance,
	stopReconnection,
} from "./client";
