/**
 * @overview Compile-time Protocol and Transport public seam probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";

import type {
	IRpcConnection,
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
} from "../../src/index";
import type {
	IRpcConnection as ProtocolConnection,
	IRpcProtocol as ProtocolEntryProtocol,
} from "../../src/protocol";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
	IRpcConnection as TransportConnection,
} from "../../src/transport";

const messageSubject = new Subject<Uint8Array>();

const connection = {
	message$: messageSubject.asObservable(),
	async send(_message: Uint8Array): Promise<void> {},
	async close(): Promise<void> {},
} satisfies IRpcConnection;

const protocol = {
	createConnector: () => ({
		async bind(
			_connection: IRpcConnection,
			_signal: AbortSignal,
		): Promise<void> {},
		async shutdown(): Promise<void> {},
		close(): void {},
		async cleanup(): Promise<void> {},
	}),
	createAcceptor: () => ({
		async accept(
			_connection: IRpcConnection,
			_signal: AbortSignal,
		): Promise<void> {},
		async shutdown(): Promise<void> {},
		close(): void {},
		async cleanup(): Promise<void> {},
	}),
} satisfies IRpcProtocol;

const policy = {
	maxSessions: 1,
	maxHandshakes: 1,
	maxPendingInvocationsPerSession: 256,
	maxRetainedBytesPerSession: 32 * 1024 * 1024,
	maxRetainedBytesTotal: 32 * 1024 * 1024,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 16,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
} satisfies IRpcProtocolRuntimePolicy;

const connectorAdapter = {
	connection$: new Subject<IRpcConnection>().asObservable(),
	async connect(_signal: AbortSignal): Promise<void> {},
} satisfies IRpcConnectorAdapter;

const acceptorAdapter = {
	connection$: new Subject<IRpcConnection>().asObservable(),
	async listen(_signal: AbortSignal): Promise<void> {},
} satisfies IRpcAcceptorAdapter;

const sameProtocolDeclaration: ProtocolEntryProtocol = protocol;
const sameProtocolConnection: ProtocolConnection = connection;
const sameTransportConnection: TransportConnection = connection;

void policy;
void connectorAdapter;
void acceptorAdapter;
void sameProtocolDeclaration;
void sameProtocolConnection;
void sameTransportConnection;

// @ts-expect-error RPC-PKG-003 keeps the built-in Protocol private.
type MissingRpcProtocolImpl = import("../../src/index").RpcProtocolImpl;
void (null as unknown as MissingRpcProtocolImpl);
