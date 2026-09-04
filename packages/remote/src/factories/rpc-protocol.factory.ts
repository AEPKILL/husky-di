/**
 * @overview Assembles fresh owner-scoped built-in Protocol roles.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcCodecImpl } from "@/impls/protocol/rpc-codec.impl";
import { RpcProtocolAcceptorImpl } from "@/impls/protocol/rpc-protocol-acceptor.impl";
import { RpcProtocolConnectorImpl } from "@/impls/protocol/rpc-protocol-connector.impl";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import { createRpcSecurityCarrier } from "@/utils/protocol/rpc-base64-url-32-schema.util";

/** Creates a fresh built-in Connector Protocol role for one owner. */
export function createRpcProtocolConnector(
	host: IRpcProtocolConnectorHost,
): IRpcProtocolConnector {
	return createBuiltInRpcProtocolConnector(host, false);
}

/** Creates a fresh built-in Acceptor Protocol role for one owner. */
export function createRpcProtocolAcceptor(
	host: IRpcProtocolAcceptorHost,
): IRpcProtocolAcceptor {
	return createBuiltInRpcProtocolAcceptor(host, false);
}

/** Creates a package-private Connector counter-exhaustion fixture. */
export function createRpcCounterExhaustionProtocolConnectorForTest(
	host: IRpcProtocolConnectorHost,
): IRpcProtocolConnector {
	return createBuiltInRpcProtocolConnector(host, true);
}

/** Creates a package-private Acceptor counter-exhaustion fixture. */
export function createRpcCounterExhaustionProtocolAcceptorForTest(
	host: IRpcProtocolAcceptorHost,
): IRpcProtocolAcceptor {
	return createBuiltInRpcProtocolAcceptor(host, true);
}

const codec = Object.freeze(new RpcCodecImpl());

function createBuiltInRpcProtocolConnector(
	host: IRpcProtocolConnectorHost,
	counterExhausted: boolean,
): IRpcProtocolConnector {
	return new RpcProtocolConnectorImpl({
		host,
		codec,
		counterExhausted,
	});
}

function createBuiltInRpcProtocolAcceptor(
	host: IRpcProtocolAcceptorHost,
	counterExhausted: boolean,
): IRpcProtocolAcceptor {
	return new RpcProtocolAcceptorImpl({
		host,
		codec,
		createSecurityCarrier: createRpcSecurityCarrier,
		counterExhausted,
	});
}
