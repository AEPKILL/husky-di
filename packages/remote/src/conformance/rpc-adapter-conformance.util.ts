/**
 * @overview Black-box conformance cases for public RPC Transport Adapters.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createAcceptorAdapterConformanceCases } from "@/conformance/rpc-acceptor-adapter-conformance.util";
import type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcConnectorAdapterConformanceFixture,
} from "@/conformance/rpc-conformance.interface";
import type { RpcConformanceOptions } from "@/conformance/rpc-conformance.type";
import { runRpcConformanceCases } from "@/conformance/rpc-conformance.util";
import { createConnectorAdapterConformanceCases } from "@/conformance/rpc-connector-adapter-conformance.util";

/** Runs the stable Connector Adapter conformance cases documented by `/conformance`. */
export function runRpcConnectorAdapterConformance(
	fixture: IRpcConnectorAdapterConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	return runRpcConformanceCases(
		createConnectorAdapterConformanceCases(fixture),
		options,
	);
}

/** Runs the stable Acceptor Adapter conformance cases documented by `/conformance`. */
export function runRpcAcceptorAdapterConformance(
	fixture: IRpcAcceptorAdapterConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	return runRpcConformanceCases(
		createAcceptorAdapterConformanceCases(fixture),
		options,
	);
}
