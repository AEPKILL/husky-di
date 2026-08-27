/**
 * @overview Public structural fixtures for RPC Protocol and Adapter conformance.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcProtocol } from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@/interfaces/transport/rpc-adapter.interface";

export interface IRpcProtocolConformanceFixture {
	readonly protocol: IRpcProtocol;
	readonly counterExhaustionProtocol: IRpcProtocol;
	createActiveProtocolFaultMessage(): Uint8Array;
}

export interface IRpcAdapterConformanceRemote {
	sendToAdapter(message: Uint8Array): Promise<void>;
	receiveFromAdapter(): Promise<Uint8Array>;
	setAdapterSendBlocked(blocked: boolean): Promise<void>;
	closeFromRemote(): Promise<void>;
	failFromRemote(error: Error): Promise<void>;
	isAdapterClosed(): boolean;
	waitForAdapterClose(): Promise<void>;
}

export interface IRpcConnectorAdapterConformanceFixture {
	create(): Promise<{
		readonly adapter: IRpcConnectorAdapter;
		handoff(firstMessage?: Uint8Array): Promise<IRpcAdapterConformanceRemote>;
		failStartup(error: Error): Promise<void>;
		cleanup(): Promise<void>;
	}>;
}

export interface IRpcAcceptorAdapterConformanceFixture {
	create(): Promise<{
		readonly adapter: IRpcAcceptorAdapter;
		accept(firstMessage?: Uint8Array): Promise<IRpcAdapterConformanceRemote>;
		markReady(): Promise<void>;
		completeListener(): Promise<void>;
		failListener(error: Error): Promise<void>;
		cleanup(): Promise<void>;
	}>;
}
