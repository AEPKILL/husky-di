/**
 * @overview Positive and negative type probes for the RPC Interface throwaway prototype.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";

import type { SessionService } from "./fixtures";
import { customProtocol, IClientEvents, ISession } from "./fixtures";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	defaultRpcProtocol,
	type IRpcAcceptor,
	type IRpcAcceptorAdapter,
	type IRpcConnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcPeer,
	RpcError,
	type RpcEvent,
	type RpcMethodDefinitions,
	type RpcPeerResult,
	type RpcUnaryMethodDefinition,
} from "./rpc-interface";

interface SpecialSignal extends AbortSignal {
	readonly special: true;
}

interface InvalidSpecialSignalService {
	run(signal: SpecialSignal): void;
}

interface InvalidObservableHandlerService {
	run(): string | Promise<Observable<string>>;
}

declare const typeValidationPeer: IRpcPeer;
declare const typeValidationAcceptor: IRpcAcceptor;
declare const typeValidationAcceptorAdapter: IRpcAcceptorAdapter;
declare const typeValidationConnector: IRpcConnector;
declare const typeValidationConnectorAdapter: IRpcConnectorAdapter;
declare const typeValidationConnection: IRpcConnection;
declare const typeValidationEvent: RpcEvent;

/** This function exists only for TypeScript validation and must never be called. */
export function typeValidationUsage(): void {
	const pingDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-ping.v1",
		methods: { ping: true },
	});
	const pingRemote = typeValidationPeer.resolve(pingDescriptor);
	const pingResult: Promise<boolean> = pingRemote.ping();
	void pingResult;
	// @ts-expect-error The exact allowlist did not select login.
	void pingRemote.login;

	const annotatedPing: RpcUnaryMethodDefinition<SessionService["ping"]> = true;
	const checkedMethods = {
		ping: annotatedPing,
	} satisfies RpcMethodDefinitions<SessionService>;
	const checkedDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-checked.v1",
		methods: checkedMethods,
	});
	void typeValidationPeer.resolve(checkedDescriptor).ping;

	const widenedMethods: RpcMethodDefinitions<SessionService> = checkedMethods;
	const widenedDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-widened.v1",
		methods: widenedMethods,
	});
	const widenedRemote = typeValidationPeer.resolve(widenedDescriptor);
	// @ts-expect-error Optional keys on a widened map are not runtime selections.
	void widenedRemote.ping;

	const cancelableDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-login.v1",
		methods: { login: { cancelable: true } },
	});
	const cancelableRemote = typeValidationPeer.resolve(cancelableDescriptor);
	const callerSignal = new AbortController().signal;
	const loginResult: Promise<string> = cancelableRemote.login(
		"aepkill",
		"secret",
	);
	const loginWithSignalResult: Promise<string> = cancelableRemote.login(
		"aepkill",
		"secret",
		callerSignal,
	);
	void loginResult;
	void loginWithSignalResult;
	// @ts-expect-error Caller cancellation accepts only AbortSignal.
	cancelableRemote.login("aepkill", "secret", "not-a-signal");

	const remoteClientEvents = createRemoteServiceDescriptor(IClientEvents, {
		wireName: "example.client-events.v1",
		methods: { changed: true },
	});
	const batchResult: Promise<readonly RpcPeerResult<void>[]> =
		typeValidationAcceptor
			.resolveAll(remoteClientEvents)
			.changed("maintenance-scheduled");
	const cancelableBatch =
		typeValidationAcceptor.resolveAll(cancelableDescriptor);
	const cancelableBatchResult: Promise<readonly RpcPeerResult<string>[]> =
		cancelableBatch.login("aepkill", "secret");
	const batchWithSignalResult: Promise<readonly RpcPeerResult<string>[]> =
		cancelableBatch.login("aepkill", "secret", callerSignal);
	// @ts-expect-error Batch cancellation also accepts only AbortSignal.
	cancelableBatch.login("aepkill", "secret", "not-a-signal");
	void batchResult;
	void cancelableBatchResult;
	void batchWithSignalResult;

	const connector = createRpcConnector();
	const customProtocolConnector = createRpcConnector({
		protocol: customProtocol,
	});
	const explicitDefaultProtocolConnector = createRpcConnector({
		protocol: defaultRpcProtocol,
	});
	const acceptor = createRpcAcceptor();
	const connectorConnect: Promise<void> = connector.connect(
		typeValidationConnectorAdapter,
	);
	const acceptorListen: Promise<void> = acceptor.listen(
		typeValidationAcceptorAdapter,
	);
	const connectorClose: Promise<void> = connector.close();
	const event$: Observable<RpcEvent> = acceptor.event$;
	const currentPeers: readonly IRpcPeer[] = acceptor.peers;
	const exposureResult = acceptor.expose(remoteClientEvents, {
		changed: () => undefined,
	});
	const acceptedConnections: Observable<IRpcConnection> =
		typeValidationAcceptorAdapter.connection$;
	const firstConnectionObservation = acceptedConnections.subscribe(
		(connection) => void connection.message$,
	);
	const secondConnectionObservation = acceptedConnections.subscribe(
		(connection) => void connection.message$,
	);
	// Adapter implementor probe: application callers use acceptor.listen(adapter).
	const adapterListenResult: Promise<void> =
		typeValidationAcceptorAdapter.listen(callerSignal);
	const messages: Observable<Uint8Array> = typeValidationConnection.message$;
	void customProtocolConnector;
	void explicitDefaultProtocolConnector;
	void connectorConnect;
	void acceptorListen;
	void connectorClose;
	void event$;
	void currentPeers;
	void exposureResult;
	void firstConnectionObservation;
	void secondConnectionObservation;
	void adapterListenResult;
	void messages;
	exposureResult();
	if (typeValidationEvent.type === "call-started") {
		const callArguments: readonly unknown[] = typeValidationEvent.args;
		void callArguments;
		// @ts-expect-error Call argument snapshots are readonly observations.
		typeValidationEvent.args.push("late argument");
	}
	if (
		typeValidationEvent.type === "call-finished" &&
		typeValidationEvent.outcome === "fulfilled"
	) {
		const callResult: unknown = typeValidationEvent.result;
		void callResult;
	}
	if (
		typeValidationEvent.type === "topology-closed" &&
		typeValidationEvent.outcome === "failed"
	) {
		const terminalError: RpcError = typeValidationEvent.error;
		void terminalError;
	}
	if (
		typeValidationEvent.type === "topology-closed" &&
		typeValidationEvent.outcome === "closed"
	) {
		// @ts-expect-error A normal terminal has no failure payload.
		void typeValidationEvent.error;
	}

	// @ts-expect-error Connector Adapter creates one connection and is not owner-disposable.
	typeValidationConnectorAdapter.dispose();
	// @ts-expect-error Owners use role-specific connect/listen, not a generic start command.
	typeValidationConnector.start();
	// @ts-expect-error Topology terminal state is observed through event$, not a Promise property.
	void typeValidationConnector.closed;
	// @ts-expect-error Connector and Acceptor Adapter roles are not interchangeable.
	typeValidationConnector.connect(typeValidationAcceptorAdapter);
	// @ts-expect-error Connector and Acceptor Adapter roles are not interchangeable.
	typeValidationAcceptor.listen(typeValidationConnectorAdapter);
	// @ts-expect-error Lifecycle and call observations are unified under event$.
	void typeValidationAcceptor.peer$;
	// @ts-expect-error Observable consumers cannot produce Physical Connections.
	typeValidationAcceptorAdapter.connection$.next(typeValidationConnection);
	// @ts-expect-error A readonly peer snapshot cannot be mutated.
	typeValidationAcceptor.peers.push(typeValidationPeer);
	// @ts-expect-error Observable consumers cannot produce RPC events.
	typeValidationAcceptor.event$.next({
		type: "peer-opened",
		peer: typeValidationPeer,
	});
	// @ts-expect-error Observable subscriptions never own a Physical Connection.
	typeValidationConnection.message$.next(Uint8Array.of(0));
	// @ts-expect-error Protocol is an opaque value supplied by a conforming package.
	createRpcConnector({ protocol: {} });
	// @ts-expect-error RpcError instances are created by the RPC Implementation.
	new RpcError();
	// Factories create cold Topology Owners without starting I/O.
	createRpcConnector({});
	createRpcAcceptor({ protocol: customProtocol });

	// @ts-expect-error A stable wireName is mandatory and never inferred.
	createRemoteServiceDescriptor(ISession, { methods: { ping: true } });

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-methods.v1",
		// @ts-expect-error methods must be an explicit per-method allowlist.
		methods: true,
	});

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-property.v1",
		// @ts-expect-error version is not callable.
		methods: { version: true },
	});

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-unary-tag.v1",
		// @ts-expect-error v1 selected methods are already unary; type is redundant.
		methods: { ping: { type: "unary" } },
	});

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-cancelable-ping.v1",
		// @ts-expect-error ping has no required trailing AbortSignal.
		methods: { ping: { cancelable: true } },
	});

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-login.v1",
		// @ts-expect-error login's AbortSignal cannot cross the wire as an argument.
		methods: { login: true },
	});

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-stream.v1",
		// @ts-expect-error v1 defines neither streaming nor notification methods.
		methods: { ping: { type: "server-streaming" } },
	});

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.invalid-option.v1",
		methods: {
			// @ts-expect-error Method definitions accept no speculative timeout option.
			login: { cancelable: true, timeout: 1_000 },
		},
	});

	const invalidSpecialSignal =
		"invalid-special-signal" as ServiceIdentifier<InvalidSpecialSignalService>;
	createRemoteServiceDescriptor(invalidSpecialSignal, {
		wireName: "example.invalid-special-signal.v1",
		// @ts-expect-error Cancellation injection requires exactly AbortSignal.
		methods: { run: { cancelable: true } },
	});

	const invalidObservableHandler =
		"invalid-observable-handler" as ServiceIdentifier<InvalidObservableHandlerService>;
	// @ts-expect-error Observable results imply unsupported streaming semantics.
	const invalidObservableDefinition: RpcUnaryMethodDefinition<
		InvalidObservableHandlerService["run"]
	> = true;
	void invalidObservableDefinition;
	createRemoteServiceDescriptor(invalidObservableHandler, {
		wireName: "example.invalid-observable.v1",
		// @ts-expect-error Awaited Observable results are rejected by the allowlist.
		methods: { run: true },
	});
}
