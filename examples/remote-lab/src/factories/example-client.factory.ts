/**
 * @overview Assembles one retained Connector and reconnection supervisor per browser lifetime.
 * @author AEPKILL
 * @created 2026-09-09 23:59:09
 */

import {
	createRpcReconnectionConnector,
	type RpcConnectorAdapterFactory,
	type RpcConnectorRuntimePolicyOptions,
} from "@husky-di/remote";
import { LAB_RECONNECTION_POLICY } from "@/consts/lab-owner.const";
import { REMOTE_BROWSER_DISPLAY_SERVICE } from "@/consts/remote-services.const";
import type { IBrowserDisplayService } from "@/interfaces/browser-display-service.interface";
import type { IExampleClient } from "@/interfaces/example-client.interface";
import type { ILabTraceContext } from "@/interfaces/lab-trace-context.interface";
import { createLabTraceContext } from "@/utils/create-lab-trace-context.util";
import { createLabTraceInterceptor } from "@/utils/create-lab-trace-interceptor.util";

export type CreateExampleClientOptions = {
	readonly adapterFactory: RpcConnectorAdapterFactory;
	readonly display: IBrowserDisplayService;
	readonly runtimePolicy?: RpcConnectorRuntimePolicyOptions;
	readonly traceContext?: ILabTraceContext;
};

export function createExampleClient(
	options: CreateExampleClientOptions,
): IExampleClient {
	const traceContext = options.traceContext ?? createLabTraceContext();
	const reconnection = createRpcReconnectionConnector({
		runtimePolicy: options.runtimePolicy,
		interceptor: createLabTraceInterceptor(traceContext),
		adapterFactory: options.adapterFactory,
		policy: LAB_RECONNECTION_POLICY,
	});
	const { connector } = reconnection;
	connector.peer.expose(REMOTE_BROWSER_DISPLAY_SERVICE, options.display);
	let shutdownTask: Promise<void> | undefined;
	return {
		connector,
		reconnection,
		traceContext,
		shutdown() {
			shutdownTask ??= reconnection.stop().finally(() => connector.shutdown());
			return shutdownTask;
		},
	};
}
