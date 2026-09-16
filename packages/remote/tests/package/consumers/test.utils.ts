/**
 * @overview Installed strict-declaration and DOM-only consumer source fixtures.
 * @author AEPKILL
 * @created 2026-08-19 09:27:48
 */

export const strictDeclarations = `import { RpcAcceptorListenerStopReasonEnum, RpcCallDirectionEnum, RpcCallStatusEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum, RpcConnectorReconnectionAttemptFailureStageEnum, RpcConnectorReconnectionEventTypeEnum, RpcConnectorReconnectionStopReasonEnum, RpcEventTypeEnum, RpcException, RpcExceptionCodeEnum, RpcStateStatusEnum, createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector, createRpcReconnectionConnector, createRpcProtocolAcceptor, createRpcProtocolConnector } from "@husky-di/remote";
import { RpcCallTerminalTypeEnum, RpcIncomingCallKindEnum, RpcProtocolSessionTransitionTypeEnum, RpcWireRecordKindEnum } from "@husky-di/remote/protocol";
import type {
  RemoteServiceDescriptor, IRpcPeer, IRpcConnector, IRpcConnectorReconnection,
  IRpcAcceptor,
  RpcPeerState, RpcConnectorState, RpcAcceptorListenerState, RpcAcceptorState,
  RpcEvent,
  RpcConnectorOptions, RpcConnectorConnectOptions, RpcAcceptorOptions,
  RpcConnectorRuntimePolicyOptions,
  RpcAcceptorRuntimePolicyOptions, IRpcConnection as RootConnection,
  IRpcConnectorAdapter, IRpcAcceptorAdapter,
  IRpcProtocolRuntimePolicy, IRpcApplicationRecord, RpcApplicationValue,
  RpcCallFailure, RpcProtocolFaultReason, RpcSessionCloseReason,
  CreateRpcReconnectionConnectorOptions, RpcConnectorAdapterFactory,
  RpcConnectorReconnectionEvent, RpcConnectorReconnectionPolicyOptions,
  RpcConnectorReconnectionState, RpcProtocolAcceptorFactory as RootProtocolAcceptorFactory,
  RpcProtocolConnectorFactory as RootProtocolConnectorFactory,
} from "@husky-di/remote";
import type {
  IRpcConnection as ProtocolConnection, IRpcApplicationArgumentsSnapshot,
  IRpcApplicationRecord as ProtocolApplicationRecord, IRpcApplicationSnapshot,
  IRpcProtocolAcceptor, IRpcProtocolAcceptorHost,
  IRpcProtocolConnector, IRpcProtocolConnectorHost,
  IRpcProtocolHost, IRpcProtocolIncomingCall,
  IRpcProtocolCallRequest, IRpcProtocolStreamObserver, IRpcProtocolIncomingStream,
  IRpcProtocolIncomingHandlerCall, IRpcProtocolInvocation,
  IRpcProtocolRuntimePolicy as ProtocolRuntimePolicy, IRpcProtocolSession,
  IRpcProtocolSessionHost, IRpcRetainedBytesReservation, RpcCallOutcome, RpcHandlerOutcome,
  RpcApplicationValue as ProtocolApplicationValue,
  RpcCallFailure as ProtocolCallFailure, RpcIncomingFailure,
  RpcIncomingTerminal, RpcProtocolFaultReason as ProtocolFaultReason,
  RpcProtocolIncomingCallReservation,
  RpcProtocolSessionTransition, RpcProtocolSessionTransitionCloseReason,
  RpcSessionCloseReason as ProtocolSessionCloseReason, RpcUnknownCallFailure,
  RpcProtocolAcceptorFactory as ProtocolAcceptorFactory,
  RpcProtocolConnectorFactory as ProtocolConnectorFactory,
} from "@husky-di/remote/protocol";
import type {
  IRpcAcceptorAdapter as TransportAcceptorAdapter,
  IRpcConnection as TransportConnection,
  IRpcConnectorAdapter as TransportConnectorAdapter,
} from "@husky-di/remote/transport";
import {
  RpcConformanceStatusEnum,
  runRpcAcceptorAdapterConformance, runRpcConnectorAdapterConformance,
  runRpcProtocolConformance,
} from "@husky-di/remote/conformance";
import type {
  IRpcAcceptorAdapterConformanceFixture, IRpcAdapterConformanceRemote,
  IRpcConnectorAdapterConformanceFixture, IRpcProtocolConformanceFixture,
  RpcConformanceCaseResult, RpcConformanceFailure, RpcConformanceOptions,
  RpcConformanceReport, RpcProtocolConformanceCandidate,
} from "@husky-di/remote/conformance";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const protocolAcceptorFactoryIdentity: Equal<RootProtocolAcceptorFactory, ProtocolAcceptorFactory> = true;
const protocolConnectorFactoryIdentity: Equal<RootProtocolConnectorFactory, ProtocolConnectorFactory> = true;
const connectionIdentity: Equal<RootConnection, ProtocolConnection & TransportConnection> = true;
const adapterIdentity: Equal<
  IRpcConnectorAdapter & IRpcAcceptorAdapter,
  TransportConnectorAdapter & TransportAcceptorAdapter
> = true;
const protocolSharedIdentity: Equal<
  IRpcApplicationRecord & IRpcProtocolRuntimePolicy & RpcApplicationValue,
  ProtocolApplicationRecord & ProtocolRuntimePolicy & ProtocolApplicationValue
> = true;
const callerException = new RpcException(RpcExceptionCodeEnum.unavailable);
const callDirection: RpcCallDirectionEnum = RpcCallDirectionEnum.incoming;
const closeReason: RpcCloseReasonEnum = RpcCloseReasonEnum.cleanupFailed;
declare const connectorAdapter: IRpcConnectorAdapter;
declare const connector: IRpcConnector;
const connectorConnectOptions: RpcConnectorConnectOptions = {
  adapter: connectorAdapter,
  signal: new AbortController().signal,
};
const adapterFactory: RpcConnectorAdapterFactory = () => connectorAdapter;
const reconnectionPolicy: RpcConnectorReconnectionPolicyOptions = {
  retryDelaysMs: [100, 200],
  attemptTimeoutMs: 1_000,
};
const reconnectionOptions: CreateRpcReconnectionConnectorOptions = {
  protocolFactory: createRpcProtocolConnector,
  runtimePolicy: { maxHandlersPerSession: 2 },
  interceptor: (_context, next) => next(),
  adapterFactory,
  policy: reconnectionPolicy,
};
const reconnection: IRpcConnectorReconnection =
  createRpcReconnectionConnector(reconnectionOptions);
const reconnectionConnector: IRpcConnector = reconnection.connector;
const reconnectionProtocolFactoryIdentity: Equal<CreateRpcReconnectionConnectorOptions["protocolFactory"], RpcConnectorOptions["protocolFactory"]> = true;
const reconnectionRuntimePolicyIdentity: Equal<CreateRpcReconnectionConnectorOptions["runtimePolicy"], RpcConnectorOptions["runtimePolicy"]> = true;
const reconnectionInterceptorIdentity: Equal<CreateRpcReconnectionConnectorOptions["interceptor"], RpcConnectorOptions["interceptor"]> = true;
// @ts-expect-error Reconnection creates its own Connector.
createRpcReconnectionConnector({ connector, adapterFactory });
const reconnectionState: RpcConnectorReconnectionState = reconnection.state;
const reconnectionEvent: RpcConnectorReconnectionEvent = {
  type: RpcConnectorReconnectionEventTypeEnum.attemptFailed,
  attempt: 1,
  stage: RpcConnectorReconnectionAttemptFailureStageEnum.connectorAttempt,
  nextDelayMs: 100,
};
void connector.connect(connectorConnectOptions);
void [
	RpcAcceptorListenerStopReasonEnum, RpcCallDirectionEnum, RpcCallStatusEnum,
	RpcCallTerminalTypeEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum, RpcEventTypeEnum,
	RpcException, RpcExceptionCodeEnum, RpcIncomingCallKindEnum,
	RpcProtocolSessionTransitionTypeEnum, RpcStateStatusEnum,
	RpcConnectorReconnectionAttemptFailureStageEnum,
	RpcConnectorReconnectionEventTypeEnum,
	RpcConnectorReconnectionStopReasonEnum,
	createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector,
		createRpcReconnectionConnector, createRpcProtocolAcceptor, createRpcProtocolConnector,
	RpcConformanceStatusEnum, runRpcAcceptorAdapterConformance, runRpcConnectorAdapterConformance,
		runRpcProtocolConformance, protocolAcceptorFactoryIdentity,
		protocolConnectorFactoryIdentity, connectionIdentity,
	adapterIdentity, protocolSharedIdentity, callerException, callDirection, closeReason,
	connectorConnectOptions, adapterFactory, reconnectionPolicy, reconnectionOptions,
	reconnection, reconnectionConnector, reconnectionState, reconnectionEvent,
	reconnectionProtocolFactoryIdentity, reconnectionRuntimePolicyIdentity, reconnectionInterceptorIdentity,
];
type Inventory = [
	RemoteServiceDescriptor<unknown, never>, IRpcPeer, IRpcConnector,
	IRpcConnectorReconnection, IRpcAcceptor,
	RpcPeerState, RpcConnectorState, RpcAcceptorListenerState,
	RpcAcceptorState, RpcCloseReasonEnum, RpcCallDirectionEnum, RpcEvent, RpcExceptionCodeEnum,
	RpcConnectorOptions, RpcConnectorConnectOptions, RpcAcceptorOptions,
	RpcConnectorRuntimePolicyOptions,
	RpcAcceptorRuntimePolicyOptions, IRpcConnectorAdapter, IRpcAcceptorAdapter,
	IRpcProtocolRuntimePolicy, IRpcApplicationRecord, RpcApplicationValue,
	RpcCallFailure, RpcProtocolFaultReason, RpcSessionCloseReason,
	CreateRpcReconnectionConnectorOptions, RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent, RpcConnectorReconnectionPolicyOptions,
	RpcConnectorReconnectionState,
  IRpcApplicationArgumentsSnapshot, IRpcApplicationSnapshot,
  IRpcProtocolAcceptor, IRpcProtocolAcceptorHost, IRpcProtocolConnector,
  IRpcProtocolConnectorHost, IRpcProtocolHost, IRpcProtocolIncomingCall,
  IRpcProtocolCallRequest, IRpcProtocolStreamObserver, IRpcProtocolIncomingStream,
  IRpcProtocolIncomingHandlerCall, IRpcProtocolInvocation,
  IRpcProtocolSession,
  IRpcProtocolSessionHost, IRpcRetainedBytesReservation, RpcCallOutcome,
  RpcHandlerOutcome, RpcIncomingFailure,
  RpcIncomingTerminal, RpcProtocolIncomingCallReservation,
  RpcProtocolSessionTransition, RpcProtocolSessionTransitionCloseReason,
  RpcUnknownCallFailure, IRpcAcceptorAdapterConformanceFixture,
  IRpcAdapterConformanceRemote, IRpcConnectorAdapterConformanceFixture,
  IRpcProtocolConformanceFixture, RpcProtocolConformanceCandidate,
  RpcConformanceCaseResult, RpcConformanceFailure,
  RpcConformanceOptions, RpcConformanceReport, ProtocolCallFailure,
  ProtocolFaultReason, ProtocolSessionCloseReason, RootProtocolAcceptorFactory,
  RootProtocolConnectorFactory, ProtocolAcceptorFactory, ProtocolConnectorFactory,
];
declare const inventory: Inventory;
void inventory;
declare const protocolRequest: IRpcProtocolCallRequest;
declare const protocolSession: IRpcProtocolSession;
declare const protocolSessionHost: IRpcProtocolSessionHost;
declare const incomingReservation: RpcProtocolIncomingCallReservation;
void protocolSession.prepareInvocation(protocolRequest, () => undefined);
void protocolSessionHost.reserveIncomingCall(protocolRequest, (reservation) => {
  void reservation.commit();
  return undefined;
});
// @ts-expect-error Outgoing reservation was replaced by atomic preparation.
void protocolSession.reserveInvocation(protocolRequest);
// @ts-expect-error Incoming reservations are a flattened tagged union.
void incomingReservation.reservation;
// @ts-expect-error Incoming reservation release is Framework-owned.
void incomingReservation.release();
// @ts-expect-error The built-in Protocol is private.
import { defaultRpcProtocol } from "@husky-di/remote";
// @ts-expect-error The former Reconnection factory name was replaced.
import { createRpcConnectorReconnection } from "@husky-di/remote";
// @ts-expect-error The former Reconnection factory options were replaced.
import type { CreateRpcConnectorReconnectionOptions } from "@husky-di/remote";
// @ts-expect-error The aggregate Protocol seam was removed in favor of role factories.
import type { IRpcProtocol } from "@husky-di/remote";
// @ts-expect-error The shared role runtime was removed in favor of role contracts.
import type { IRpcProtocolRoleRuntime } from "@husky-di/remote/protocol";
// @ts-expect-error The Connector runtime name was replaced by the Connector role contract.
import type { IRpcProtocolConnectorRuntime } from "@husky-di/remote/protocol";
// @ts-expect-error The Acceptor runtime name was replaced by the Acceptor role contract.
import type { IRpcProtocolAcceptorRuntime } from "@husky-di/remote/protocol";
// @ts-expect-error The aggregate factory was replaced by reusable role factories.
import { createRpcProtocol } from "@husky-di/remote/protocol";
// @ts-expect-error Outgoing request roles were merged into IRpcProtocolCallRequest.
import type { IRpcProtocolInvocationRequest } from "@husky-di/remote/protocol";
// @ts-expect-error Incoming request roles were merged into IRpcProtocolCallRequest.
import type { IRpcProtocolIncomingCallRequest } from "@husky-di/remote/protocol";
// @ts-expect-error Finish is passed directly to prepareInvocation().
import type { IRpcProtocolInvocationSink } from "@husky-di/remote/protocol";
// @ts-expect-error Outgoing reservation is folded into preparation.
import type { IRpcProtocolInvocationReservation } from "@husky-di/remote/protocol";
// @ts-expect-error Incoming reservation is the flattened tagged union.
import type { IRpcProtocolIncomingCallReservation } from "@husky-di/remote/protocol";
// @ts-expect-error Descriptor mapped helpers are private.
import type { RemoteService, RpcMethodDefinitions } from "@husky-di/remote";
// @ts-expect-error The legacy interface-prefixed Descriptor name is not exported.
import type { IRemoteServiceDescriptor } from "@husky-di/remote";
// @ts-expect-error Concrete implementation classes are private.
import type { RpcConnectorImpl as RootRpcConnectorImpl } from "@husky-di/remote";
// @ts-expect-error Implementation deep imports are private.
import type { RpcConnectorImpl as DeepRpcConnectorImpl } from "@husky-di/remote/dist/modules/owner/impls/rpc-connector.impl.js";
// @ts-expect-error RPC-API-007 removes the aggregate result type.
import type { RpcPeerResult } from "@husky-di/remote";
declare const acceptor: IRpcAcceptor;
// @ts-expect-error RPC-API-007 keeps multi-peer composition application-owned.
acceptor.resolveAll;

import { createServiceIdentifier } from "@husky-di/core";
import { Observable, of } from "rxjs";
import type { RpcInterceptor } from "@husky-di/remote";
type StreamService = { read(): number; watch(topic: string): Observable<number>; updates$: Observable<number> };
const streamIdentifier = createServiceIdentifier<StreamService>("packed.stream");
const streamDescriptor = createRemoteServiceDescriptor(streamIdentifier, {
  wireName: "packed.stream", members: { read: { kind: "function" }, watch: { kind: "observable-function" }, updates$: { kind: "observable" } },
});
const streamInterceptor: RpcInterceptor = (_context, next) => next();
const streamOwner = createRpcConnector({ interceptor: streamInterceptor });
const streamRemote = streamOwner.peer.resolve(streamDescriptor);
const unaryValue: Promise<number> = streamRemote.read();
const methodValues: Observable<number> = streamRemote.watch("all");
const staticValues: Observable<number> = streamRemote.updates$;
methodValues.subscribe().unsubscribe();
staticValues.subscribe().unsubscribe();
// @ts-expect-error Static remote Observable members are readonly.
streamRemote.updates$ = of(1);
// @ts-expect-error The legacy descriptor methods key is rejected.
createRemoteServiceDescriptor(streamIdentifier, { wireName: "legacy", methods: { read: {} } });
// @ts-expect-error The legacy Owner interceptor option is rejected.
createRpcConnector({ callInterceptor: streamInterceptor });
// @ts-expect-error The legacy interceptor type is not exported.
import type { RpcCallInterceptor } from "@husky-di/remote";
// @ts-expect-error Interceptors must return Observable, not Promise.
const promiseInterceptor: RpcInterceptor = async () => 1;
void [unaryValue, promiseInterceptor];
`;

export const domConsumer = `import { createRemoteServiceDescriptor, createRpcConnector, createRpcReconnectionConnector } from "@husky-di/remote";
import type { RpcProtocolConnectorFactory } from "@husky-di/remote";
import type { IRpcConnectorAdapter } from "@husky-di/remote/transport";
import { runRpcConnectorAdapterConformance } from "@husky-di/remote/conformance";

declare const connection$: IRpcConnectorAdapter["connection$"];
declare const protocolFactory: RpcProtocolConnectorFactory;
const adapter: IRpcConnectorAdapter = {
  connection$,
  async connect(signal: AbortSignal) { signal.throwIfAborted(); },
};
const reconnection = createRpcReconnectionConnector({
  protocolFactory,
  adapterFactory: () => adapter,
});
const connector = reconnection.connector;
void [connector, reconnection.connect(), runRpcConnectorAdapterConformance];

import { createServiceIdentifier } from "@husky-di/core";
import { Observable, of } from "rxjs";
import type { RpcInterceptor } from "@husky-di/remote";
type StreamService = { read(): number; watch(topic: string): Observable<number>; updates$: Observable<number> };
const streamIdentifier = createServiceIdentifier<StreamService>("packed.stream");
const streamDescriptor = createRemoteServiceDescriptor(streamIdentifier, {
  wireName: "packed.stream", members: { read: { kind: "function" }, watch: { kind: "observable-function" }, updates$: { kind: "observable" } },
});
const streamInterceptor: RpcInterceptor = (_context, next) => next();
const streamOwner = createRpcConnector({ interceptor: streamInterceptor });
const streamRemote = streamOwner.peer.resolve(streamDescriptor);
const unaryValue: Promise<number> = streamRemote.read();
const methodValues: Observable<number> = streamRemote.watch("all");
const staticValues: Observable<number> = streamRemote.updates$;
methodValues.subscribe().unsubscribe();
staticValues.subscribe().unsubscribe();
// @ts-expect-error Static remote Observable members are readonly.
streamRemote.updates$ = of(1);
// @ts-expect-error The legacy descriptor methods key is rejected.
createRemoteServiceDescriptor(streamIdentifier, { wireName: "legacy", methods: { read: {} } });
// @ts-expect-error The legacy Owner interceptor option is rejected.
createRpcConnector({ callInterceptor: streamInterceptor });
// @ts-expect-error The legacy interceptor type is not exported.
import type { RpcCallInterceptor } from "@husky-di/remote";
// @ts-expect-error Interceptors must return Observable, not Promise.
const promiseInterceptor: RpcInterceptor = async () => 1;
void [unaryValue, promiseInterceptor];
`;
