/**
 * @overview Public owner-scoped Protocol role factory types.
 * @author AEPKILL
 * @created 2026-08-31 00:00:00
 */

import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";

export type RpcProtocolConnectorFactory = (
	host: IRpcProtocolConnectorHost,
) => IRpcProtocolConnector;

export type RpcProtocolAcceptorFactory = (
	host: IRpcProtocolAcceptorHost,
) => IRpcProtocolAcceptor;
