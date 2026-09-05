/**
 * @overview Private scoped acquisition and work contract for a Protocol case.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcProtocolConformanceCandidate } from "@/conformance/rpc-conformance.type";
import type { ProtocolPair } from "@/conformance/types/rpc-protocol-case.type";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";

export interface IRpcProtocolCaseLifetime {
	run(
		candidate: RpcProtocolConformanceCandidate,
		work: (scope: IRpcProtocolCaseScope) => void | Promise<void>,
	): Promise<void>;
}

export interface IRpcProtocolCaseScope {
	createRole(
		kind: "connector",
		host: IRpcProtocolConnectorHost,
	): IRpcProtocolConnector;
	createRole(
		kind: "acceptor",
		host: IRpcProtocolAcceptorHost,
	): IRpcProtocolAcceptor;
	openPair(): Promise<ProtocolPair>;
	close(role: IRpcProtocolConnector | IRpcProtocolAcceptor): void;
	cleanup(role: IRpcProtocolConnector | IRpcProtocolAcceptor): Promise<void>;
	waitFor(predicate: () => boolean, operation: string): Promise<void>;
	waitForTask<T>(task: Promise<T>, operation: string): Promise<T>;
}

export type RpcProtocolCaseLifetimeFactory = () => IRpcProtocolCaseLifetime;
