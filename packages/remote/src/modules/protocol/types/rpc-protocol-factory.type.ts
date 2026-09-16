/**
 * @overview Public owner-scoped Protocol role factory types.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";

export type RpcProtocolConnectorFactory = (
	host: IRpcProtocolConnectorHost,
) => IRpcProtocolConnector;

export type RpcProtocolAcceptorFactory = (
	host: IRpcProtocolAcceptorHost,
) => IRpcProtocolAcceptor;
