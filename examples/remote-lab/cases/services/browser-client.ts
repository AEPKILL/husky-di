/**
 * @overview Adapts the shared client to native WebSocket inside a real Chromium page.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import type { ILabNodeContext } from "@husky-di/example-remote-lab/sdk";
import { createClient } from "./client";

export async function labNode(context: ILabNodeContext) {
	const factory = () =>
		createWebSocketConnectorAdapter({
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
	stopReconnection,
} from "./client";
