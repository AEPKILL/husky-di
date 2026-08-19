/**
 * @overview WebSocket package RPC Protocol implementation.
 * @author AEPKILL
 * @created 2026-08-19 10:00:00
 */

import { createRpcProtocol, type IRpcProtocol } from "@husky-di/remote";

type RpcProtocolConnectorHost = Parameters<IRpcProtocol["createConnector"]>[0];
type RpcProtocolConnectorRuntime = ReturnType<IRpcProtocol["createConnector"]>;
type RpcProtocolAcceptorHost = Parameters<IRpcProtocol["createAcceptor"]>[0];
type RpcProtocolAcceptorRuntime = ReturnType<IRpcProtocol["createAcceptor"]>;

/** Provides the built-in RPC semantics through the WebSocket package surface. */
export class WebSocketRpcProtocolImpl implements IRpcProtocol {
	private readonly _protocol = createRpcProtocol();

	createConnector(host: RpcProtocolConnectorHost): RpcProtocolConnectorRuntime {
		return this._protocol.createConnector(host);
	}

	createAcceptor(host: RpcProtocolAcceptorHost): RpcProtocolAcceptorRuntime {
		return this._protocol.createAcceptor(host);
	}
}
