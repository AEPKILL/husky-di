/**
 * @overview Positive and negative type probes for the RPC Interface throwaway prototype.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";

import {
	customProtocol,
	IClientEvents,
	ISession,
	sessionService,
} from "./fixtures";
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
	RpcErrorCodeEnum,
	type RpcEvent,
	RpcException,
	type RpcPeerResult,
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

interface InvalidAsyncIterableHandlerService {
	run(): AsyncIterable<string>;
}

interface InvalidAnyParameterService {
	// biome-ignore lint/suspicious/noExplicitAny: verifies that untyped wire parameters are rejected.
	run(value: any): string;
}

interface InvalidAnyResultService {
	// biome-ignore lint/suspicious/noExplicitAny: verifies that untyped wire results are rejected.
	run(): any;
}

interface InvalidPromiseAnyResultService {
	// biome-ignore lint/suspicious/noExplicitAny: verifies that awaited untyped wire results are rejected.
	run(): Promise<any>;
}

interface InvalidOptionalSignalService {
	run(signal?: AbortSignal): void;
}

interface InvalidVariadicCancellationService {
	run(...args: [...values: string[], signal: AbortSignal]): void;
}

interface PingOnlyService {
	ping(): boolean;
}

interface SupportedParameterShapesService {
	join(separator: string, ...values: string[]): string;
	search(query: string, limit?: number): readonly string[];
}

interface UnsupportedGenericService {
	identity<T>(value: T): T;
}

interface UnsupportedOverloadedService {
	parse(value: string): string;
	parse(value: number): number;
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
	// A selected-method implementation does not need unexposed members of SessionService.
	const pingExposure = typeValidationPeer.expose(pingDescriptor, {
		ping: () => true,
	});
	// A complete implementation remains structurally assignable.
	typeValidationPeer.expose(pingDescriptor, sessionService);
	pingExposure();
	// @ts-expect-error Every selected method is required by expose().
	typeValidationPeer.expose(pingDescriptor, {});
	typeValidationPeer.expose(pingDescriptor, {
		// @ts-expect-error The implementation must preserve the local method contract.
		ping: () => "not-a-boolean",
	});
	// @ts-expect-error Descriptor runtime fields stay behind the opaque Interface.
	void pingDescriptor.wireName;

	const checkedMethods = { ping: true } as const;
	const checkedDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-checked.v1",
		methods: checkedMethods,
	});
	void typeValidationPeer.resolve(checkedDescriptor).ping;

	const pingOnlyIdentifier = "ping-only" as ServiceIdentifier<PingOnlyService>;
	const pingOnlyDescriptor = createRemoteServiceDescriptor(pingOnlyIdentifier, {
		wireName: "example.ping-only.v1",
		methods: { ping: true },
	});
	// @ts-expect-error Descriptor service types are invariant in both directions.
	pingOnlyDescriptor satisfies typeof pingDescriptor;
	// @ts-expect-error Descriptor service types are invariant in both directions.
	pingDescriptor satisfies typeof pingOnlyDescriptor;

	const parameterShapesIdentifier =
		"parameter-shapes" as ServiceIdentifier<SupportedParameterShapesService>;
	const parameterShapesDescriptor = createRemoteServiceDescriptor(
		parameterShapesIdentifier,
		{
			wireName: "example.parameter-shapes.v1",
			methods: { join: true, search: true },
		},
	);
	const parameterShapesRemote = typeValidationPeer.resolve(
		parameterShapesDescriptor,
	);
	const joined: Promise<string> = parameterShapesRemote.join(",", "a", "b");
	const found: Promise<readonly string[]> = parameterShapesRemote.search(
		"query",
		10,
	);
	void joined;
	void found;

	const cancelableDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-login.v1",
		methods: { login: { cancelable: true } },
	});
	const completeDescriptor = createRemoteServiceDescriptor(ISession, {
		wireName: "example.session-complete.v1",
		methods: { login: { cancelable: true }, ping: true },
	});
	// @ts-expect-error Descriptor method selections are invariant in both directions.
	pingDescriptor satisfies typeof completeDescriptor;
	// @ts-expect-error Descriptor method selections are invariant in both directions.
	completeDescriptor satisfies typeof pingDescriptor;
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
	const connectorConnect: Promise<void> = connector.connect({
		adapter: typeValidationConnectorAdapter,
	});
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
		const terminalError: RpcException = typeValidationEvent.error;
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
	typeValidationConnector.connect({ adapter: typeValidationAcceptorAdapter });
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
	new RpcException(RpcErrorCodeEnum.unavailable);
	// Factories create cold Topology Owners without starting I/O.
	createRpcConnector({});
	createRpcAcceptor({ protocol: customProtocol });

	// @ts-expect-error A stable wireName is mandatory and never inferred.
	createRemoteServiceDescriptor(ISession, { methods: { ping: true } });

	createRemoteServiceDescriptor(ISession, {
		wireName: "example.empty.v1",
		// @ts-expect-error A Remote Service Descriptor must select at least one method.
		methods: {},
	});
	const possiblyEmptyMethods: { readonly ping?: true } = {};
	createRemoteServiceDescriptor(ISession, {
		wireName: "example.possibly-empty.v1",
		// @ts-expect-error Optional keys do not prove that any method is selected at runtime.
		methods: possiblyEmptyMethods,
	});

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

	const invalidAsyncIterableHandler =
		"invalid-async-iterable-handler" as ServiceIdentifier<InvalidAsyncIterableHandlerService>;
	createRemoteServiceDescriptor(invalidAsyncIterableHandler, {
		wireName: "example.invalid-async-iterable.v1",
		// @ts-expect-error AsyncIterable results imply unsupported streaming semantics.
		methods: { run: true },
	});

	const invalidAnyParameter =
		"invalid-any-parameter" as ServiceIdentifier<InvalidAnyParameterService>;
	createRemoteServiceDescriptor(invalidAnyParameter, {
		wireName: "example.invalid-any-parameter.v1",
		// @ts-expect-error any cannot provide an exact wire argument contract.
		methods: { run: true },
	});

	const invalidAnyResult =
		"invalid-any-result" as ServiceIdentifier<InvalidAnyResultService>;
	createRemoteServiceDescriptor(invalidAnyResult, {
		wireName: "example.invalid-any-result.v1",
		// @ts-expect-error any cannot provide an exact wire result contract.
		methods: { run: true },
	});
	const invalidPromiseAnyResult =
		"invalid-promise-any-result" as ServiceIdentifier<InvalidPromiseAnyResultService>;
	createRemoteServiceDescriptor(invalidPromiseAnyResult, {
		wireName: "example.invalid-promise-any-result.v1",
		// @ts-expect-error Promise<any> cannot provide an exact awaited wire result contract.
		methods: { run: true },
	});

	const invalidOptionalSignal =
		"invalid-optional-signal" as ServiceIdentifier<InvalidOptionalSignalService>;
	createRemoteServiceDescriptor(invalidOptionalSignal, {
		wireName: "example.invalid-optional-signal.v1",
		// @ts-expect-error Cancellation injection needs one required trailing AbortSignal.
		methods: { run: { cancelable: true } },
	});
	const invalidVariadicCancellation =
		"invalid-variadic-cancellation" as ServiceIdentifier<InvalidVariadicCancellationService>;
	createRemoteServiceDescriptor(invalidVariadicCancellation, {
		wireName: "example.invalid-variadic-cancellation.v1",
		// @ts-expect-error A variadic prefix cannot safely gain an optional caller signal.
		methods: { run: { cancelable: true } },
	});

	// TypeScript cannot reliably reject generic or overloaded call signatures. These
	// probes record their lossy mapping, which is why v1 declares both shapes unsupported.
	const unsupportedGeneric =
		"unsupported-generic" as ServiceIdentifier<UnsupportedGenericService>;
	const genericDescriptor = createRemoteServiceDescriptor(unsupportedGeneric, {
		wireName: "example.unsupported-generic.v1",
		methods: { identity: true },
	});
	const genericResult: Promise<unknown> = typeValidationPeer
		.resolve(genericDescriptor)
		.identity("value");
	void genericResult;

	const unsupportedOverloaded =
		"unsupported-overloaded" as ServiceIdentifier<UnsupportedOverloadedService>;
	const overloadedDescriptor = createRemoteServiceDescriptor(
		unsupportedOverloaded,
		{
			wireName: "example.unsupported-overloaded.v1",
			methods: { parse: true },
		},
	);
	const overloadedRemote = typeValidationPeer.resolve(overloadedDescriptor);
	const lastOverloadResult: Promise<number> = overloadedRemote.parse(1);
	void lastOverloadResult;
	// @ts-expect-error The conditional mapping retained only the final overload.
	overloadedRemote.parse("value");
}
