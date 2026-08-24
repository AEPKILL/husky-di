/**
 * @overview THROWAWAY final caller-facing and exposure Interface prototype.
 *
 * Design evidence only. This file is not production code, a package export, or
 * the normative specification. It deliberately models the proposed final
 * surface while the current @husky-di/remote production surface still contains
 * the unary-draft names called out in the companion README.
 *
 * @author AEPKILL
 * @created 2026-08-23 00:00:00
 */

import {
	BehaviorSubject,
	isObservable,
	map,
	merge,
	Observable,
	Subject,
	Subscriber,
	Subscription,
} from "rxjs";

export type Cleanup = () => void;

type AbstractConstructor<T> = abstract new (...args: never[]) => T;
declare const SERVICE_IDENTIFIER_TYPE: unique symbol;
export type ServiceIdentifier<T> = (
	| AbstractConstructor<T>
	| string
	| symbol
) & {
	readonly [SERVICE_IDENTIFIER_TYPE]: (value: T) => T;
};

export function createServiceIdentifier<T>(
	description: string,
): ServiceIdentifier<T> {
	return Symbol(description) as ServiceIdentifier<T>;
}

export const RpcCallStatusEnum = Object.freeze({
	fulfilled: "fulfilled",
	rejected: "rejected",
	terminated: "terminated",
} as const);

export const RpcEventDirectionEnum = Object.freeze({
	incoming: "incoming",
	outgoing: "outgoing",
} as const);

export const RpcEventTypeEnum = Object.freeze({
	callStarted: "call-started",
	callFinished: "call-finished",
	streamStarted: "stream-started",
	streamFinished: "stream-finished",
	peerOpened: "peer-opened",
	peerRecovering: "peer-recovering",
	peerRecovered: "peer-recovered",
	peerDraining: "peer-draining",
	peerClosed: "peer-closed",
	ownerDraining: "owner-draining",
	ownerClosing: "owner-closing",
	topologyClosed: "topology-closed",
} as const);

export const RpcExceptionCodeEnum = Object.freeze({
	canceled: "canceled",
	unavailable: "unavailable",
	outcomeUnknown: "outcome-unknown",
	handlerFailed: "handler-failed",
	unknownService: "unknown-service",
	unknownMember: "unknown-member",
	overflow: "overflow",
	protocol: "protocol",
} as const);

export const RpcStreamStatusEnum = Object.freeze({
	completed: "completed",
	canceled: "canceled",
	failed: "failed",
	terminated: "terminated",
} as const);

export type RpcExceptionCode =
	(typeof RpcExceptionCodeEnum)[keyof typeof RpcExceptionCodeEnum];

export type RpcCallFailure =
	| typeof RpcExceptionCodeEnum.canceled
	| typeof RpcExceptionCodeEnum.unavailable
	| typeof RpcExceptionCodeEnum.outcomeUnknown
	| typeof RpcExceptionCodeEnum.handlerFailed
	| typeof RpcExceptionCodeEnum.unknownService
	| typeof RpcExceptionCodeEnum.unknownMember;

export type RpcStreamFailure = Exclude<
	RpcExceptionCode,
	typeof RpcExceptionCodeEnum.canceled | typeof RpcExceptionCodeEnum.protocol
>;

export class RpcException extends Error {
	public readonly code: RpcExceptionCode;

	public constructor(code: RpcExceptionCode) {
		super(`Remote RPC failed safely (${code}).`);
		this.name = "RpcException";
		this.code = code;
	}
}

export type RpcPeerState =
	| { readonly status: "unbound" }
	| { readonly status: "connecting" }
	| { readonly status: "connected" }
	| { readonly status: "recovering" }
	| { readonly status: "draining" }
	| { readonly status: "closed" };

export interface IRpcPeer {
	readonly state: RpcPeerState;
	readonly state$: Observable<RpcPeerState>;
	expose<T, Members extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Members>,
		implementation: NoInfer<RemoteServiceImplementation<T, Members>>,
	): Cleanup;
	resolve<T, Members extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Members>,
	): RemoteService<T, Members>;
}

type RpcObservationBase = {
	readonly observationId: string;
	readonly peer: IRpcPeer;
};

type RpcOutgoingKnownContext = {
	readonly direction: typeof RpcEventDirectionEnum.outgoing;
	readonly service: string;
	readonly member: string;
};

type RpcIncomingKnownContext = {
	readonly direction: typeof RpcEventDirectionEnum.incoming;
	readonly service: string;
	readonly member: string;
};

type RpcIncomingUnknownServiceContext = {
	readonly direction: typeof RpcEventDirectionEnum.incoming;
	readonly service?: never;
	readonly member?: never;
};

type RpcIncomingUnknownMemberContext = {
	readonly direction: typeof RpcEventDirectionEnum.incoming;
	readonly service: string;
	readonly member?: never;
};

type RpcCallContext =
	| RpcOutgoingKnownContext
	| RpcIncomingKnownContext
	| RpcIncomingUnknownServiceContext
	| RpcIncomingUnknownMemberContext;

type RpcCallStartedEvent = RpcObservationBase &
	RpcCallContext & { readonly type: typeof RpcEventTypeEnum.callStarted };

type RpcCallFinishedEvent = RpcObservationBase &
	RpcCallContext & {
		readonly type: typeof RpcEventTypeEnum.callFinished;
		readonly durationMs: number;
		readonly outcome:
			| typeof RpcCallStatusEnum.fulfilled
			| typeof RpcCallStatusEnum.rejected
			| typeof RpcCallStatusEnum.terminated;
		readonly code?: RpcCallFailure;
	};

export type RpcStreamStartedEvent = RpcObservationBase &
	(
		| RpcOutgoingKnownContext
		| RpcIncomingKnownContext
		| RpcIncomingUnknownServiceContext
		| RpcIncomingUnknownMemberContext
	) & { readonly type: typeof RpcEventTypeEnum.streamStarted };

type RpcStreamFinishedBase = RpcObservationBase & {
	readonly type: typeof RpcEventTypeEnum.streamFinished;
	readonly durationMs: number;
};

export type RpcStreamFinishedEvent = RpcStreamFinishedBase &
	(
		| (RpcOutgoingKnownContext & {
				readonly outcome:
					| typeof RpcStreamStatusEnum.completed
					| typeof RpcStreamStatusEnum.canceled;
				readonly code?: never;
				readonly deliveredItemCount: number;
				readonly admittedItemCount?: never;
				readonly sourceTeardownFailed?: never;
		  })
		| (RpcOutgoingKnownContext & {
				readonly outcome: typeof RpcStreamStatusEnum.failed;
				readonly code: RpcStreamFailure;
				readonly deliveredItemCount: number;
				readonly admittedItemCount?: never;
				readonly sourceTeardownFailed?: never;
		  })
		| (RpcIncomingKnownContext & {
				readonly outcome:
					| typeof RpcStreamStatusEnum.completed
					| typeof RpcStreamStatusEnum.canceled
					| typeof RpcStreamStatusEnum.terminated;
				readonly code?: never;
				readonly admittedItemCount: number;
				readonly deliveredItemCount?: never;
				readonly sourceTeardownFailed?: true;
		  })
		| (RpcIncomingKnownContext & {
				readonly outcome: typeof RpcStreamStatusEnum.failed;
				readonly code:
					| typeof RpcExceptionCodeEnum.handlerFailed
					| typeof RpcExceptionCodeEnum.overflow;
				readonly admittedItemCount: number;
				readonly deliveredItemCount?: never;
				readonly sourceTeardownFailed?: true;
		  })
		| (RpcIncomingUnknownServiceContext & {
				readonly outcome: typeof RpcStreamStatusEnum.failed;
				readonly code: typeof RpcExceptionCodeEnum.unknownService;
				readonly admittedItemCount: 0;
				readonly deliveredItemCount?: never;
				readonly sourceTeardownFailed?: never;
		  })
		| (RpcIncomingUnknownMemberContext & {
				readonly outcome: typeof RpcStreamStatusEnum.failed;
				readonly code: typeof RpcExceptionCodeEnum.unknownMember;
				readonly admittedItemCount: 0;
				readonly deliveredItemCount?: never;
				readonly sourceTeardownFailed?: never;
		  })
	);

type RpcPeerLifecycleEvent =
	| {
			readonly type:
				| typeof RpcEventTypeEnum.peerOpened
				| typeof RpcEventTypeEnum.peerRecovering
				| typeof RpcEventTypeEnum.peerRecovered;
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: typeof RpcEventTypeEnum.peerDraining;
			readonly peer: IRpcPeer;
			readonly reason: "graceful-shutdown" | "counter-exhaustion";
	  }
	| {
			readonly type: typeof RpcEventTypeEnum.peerClosed;
			readonly peer: IRpcPeer;
			readonly outcome: "normal" | "failed";
			readonly reason: string;
	  };

type RpcTopologyLifecycleEvent =
	| { readonly type: typeof RpcEventTypeEnum.ownerDraining }
	| { readonly type: typeof RpcEventTypeEnum.ownerClosing }
	| {
			readonly type: typeof RpcEventTypeEnum.topologyClosed;
			readonly outcome: "normal" | "failed";
			readonly reason: string;
	  };

export type RpcEvent =
	| RpcCallStartedEvent
	| RpcCallFinishedEvent
	| RpcStreamStartedEvent
	| RpcStreamFinishedEvent
	| RpcPeerLifecycleEvent
	| RpcTopologyLifecycleEvent;

export interface IRpcProtocolRuntimePolicy {
	readonly maxSessions: number;
	readonly maxHandshakes: number;
	readonly maxApplicationWorkPerSession: number;
	readonly maxApplicationWorkTotal: number;
	readonly maxActiveStreamsPerSession: number;
	readonly maxActiveStreamsTotal: number;
	readonly maxRetainedBytesPerSession: number;
	readonly maxRetainedBytesTotal: number;
	readonly maxHandlersPerSession: number;
	readonly maxHandlersTotal: number;
	readonly ackDelayMs: number;
	readonly activityProbeIntervalMs: number;
	readonly silenceTimeoutMs: number;
	readonly sendProgressTimeoutMs: number;
	readonly bindingAttemptTimeoutMs: number;
	readonly recoveryGraceMs: number;
	readonly shutdownDeadlineMs: number;
}

export type RpcAcceptorRuntimePolicyOptions =
	Partial<IRpcProtocolRuntimePolicy>;

export type RpcConnectorRuntimePolicyOptions = Pick<
	RpcAcceptorRuntimePolicyOptions,
	| "maxApplicationWorkPerSession"
	| "maxActiveStreamsPerSession"
	| "maxRetainedBytesPerSession"
	| "maxHandlersPerSession"
	| "ackDelayMs"
	| "activityProbeIntervalMs"
	| "silenceTimeoutMs"
	| "sendProgressTimeoutMs"
	| "bindingAttemptTimeoutMs"
	| "recoveryGraceMs"
	| "shutdownDeadlineMs"
>;

export interface IRpcAcceptor {
	readonly peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;
	expose<T, Members extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Members>,
		implementation: NoInfer<RemoteServiceImplementation<T, Members>>,
	): Cleanup;
	shutdown(): Promise<void>;
	close(): Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: method extraction must preserve arbitrary parameter variance.
type AnyMethod = (...args: any[]) => unknown;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;

type Contains<T, Candidate> =
	IsAny<T> extends true
		? true
		: [Extract<T, Candidate>] extends [never]
			? false
			: true;

type UnsupportedParameterCapability =
	| Observable<unknown>
	| AsyncIterable<unknown>
	| ReadableStream<unknown>
	| PromiseLike<unknown>;

type UnsupportedStreamItem = UnsupportedParameterCapability;

type HasUnsupportedParameter<F extends AnyMethod> = Contains<
	Parameters<F>[number],
	UnsupportedParameterCapability
>;

type HasAbortSignalParameter<F extends AnyMethod> = Contains<
	Parameters<F>[number],
	AbortSignal
>;

type UnsupportedUnaryResult =
	| Observable<unknown>
	| AsyncIterable<unknown>
	| ReadableStream<unknown>;

type IsUnsupportedUnaryResult<R> =
	IsNever<R> extends true
		? true
		: IsAny<R> extends true
			? true
			: Contains<R, UnsupportedUnaryResult>;

type HasUnsupportedUnaryResult<F extends AnyMethod> =
	IsUnsupportedUnaryResult<ReturnType<F>> extends true
		? true
		: IsUnsupportedUnaryResult<Awaited<ReturnType<F>>>;

type HasValidCancellationSlot<F extends AnyMethod> =
	Parameters<F> extends [...infer Head, infer Last]
		? number extends Parameters<F>["length"]
			? false
			: IsAny<Last> extends true
				? false
				: [Last] extends [AbortSignal]
					? [AbortSignal] extends [Last]
						? Contains<Head[number], AbortSignal> extends false
							? true
							: false
						: false
					: false
		: false;

type HasSupportedStreamResult<R> =
	IsNever<R> extends true
		? false
		: IsAny<R> extends true
			? false
			: [R] extends [Observable<infer Item>]
				? IsNever<Item> extends true
					? false
					: IsAny<Item> extends true
						? false
						: Contains<Item, UnsupportedStreamItem> extends false
							? true
							: false
				: false;

type IfEqual<X, Y, Yes, No> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
		? Yes
		: No;

type ReadonlyKey<T> = {
	[K in keyof T]-?: IfEqual<
		{ [P in K]: T[P] },
		{ -readonly [P in K]: T[P] },
		never,
		K
	>;
}[keyof T];

type RequiredKey<T> = {
	[K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

type RpcUnaryMemberDefinition<F extends AnyMethod> =
	HasUnsupportedParameter<F> extends true
		? never
		: HasUnsupportedUnaryResult<F> extends true
			? never
			: HasAbortSignalParameter<F> extends false
				? { readonly kind: "unary" }
				: HasValidCancellationSlot<F> extends true
					? {
							readonly kind: "unary";
							readonly cancelable: true;
						}
					: never;

type RpcStreamMethodDefinition<F extends AnyMethod> =
	HasUnsupportedParameter<F> extends true
		? never
		: HasAbortSignalParameter<F> extends true
			? never
			: HasSupportedStreamResult<ReturnType<F>> extends true
				? { readonly kind: "stream-method" }
				: never;

type RpcMemberDefinition<T, K extends keyof T> = K extends "then"
	? never
	: T[K] extends AnyMethod
		? RpcUnaryMemberDefinition<T[K]> | RpcStreamMethodDefinition<T[K]>
		: K extends string
			? K extends `${string}$`
				? K extends RequiredKey<T>
					? K extends ReadonlyKey<T>
						? HasSupportedStreamResult<T[K]> extends true
							? { readonly kind: "stream-property" }
							: never
						: never
					: never
				: never
			: never;

export type RpcMemberDefinitions<T> = Partial<{
	readonly [K in keyof T]: K extends string ? RpcMemberDefinition<T, K> : never;
}>;

type ExactDefinition<Expected, Actual> = Expected extends unknown
	? Actual extends Expected
		? Exclude<keyof Actual, keyof Expected> extends never
			? Actual
			: never
		: never
	: never;

type ValidateMemberDefinitions<T, Members extends object> = {
	readonly [K in keyof Members]: K extends keyof T
		? ExactDefinition<RpcMemberDefinition<T, K>, Members[K]>
		: never;
};

type SelectedMemberKey<Members> = Extract<RequiredKey<Members>, string>;

type NonEmptyMemberDefinitions<Members extends object> = [
	SelectedMemberKey<Members>,
] extends [never]
	? never
	: unknown;

type RemoteUnaryMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? Definition extends { readonly cancelable: true }
		? Args extends [...infer Head, AbortSignal]
			? (
					...args: [...Head, signal: AbortSignal | undefined]
				) => Promise<Awaited<Result>>
			: never
		: (...args: Args) => Promise<Awaited<Result>>
	: never;

type RemoteMember<T, K extends keyof T, Definition> = Definition extends {
	readonly kind: "unary";
}
	? RemoteUnaryMethod<Extract<T[K], AnyMethod>, Definition>
	: Definition extends { readonly kind: "stream-method" }
		? T[K] extends (...args: infer Args) => Observable<infer Item>
			? (...args: Args) => Observable<Item>
			: never
		: Definition extends { readonly kind: "stream-property" }
			? T[K] extends Observable<infer Item>
				? Observable<Item>
				: never
			: never;

export type RemoteService<T, Members extends RpcMemberDefinitions<T>> = {
	readonly [K in Extract<SelectedMemberKey<Members>, keyof T>]: RemoteMember<
		T,
		K,
		Members[K]
	>;
} & { readonly then?: never };

export type RemoteServiceImplementation<
	T,
	Members extends RpcMemberDefinitions<T>,
> = Required<Pick<T, Extract<SelectedMemberKey<Members>, keyof T>>>;

declare const REMOTE_SERVICE_DESCRIPTOR_TYPE: unique symbol;

export interface IRemoteServiceDescriptor<
	T,
	Members extends RpcMemberDefinitions<T>,
> {
	readonly [REMOTE_SERVICE_DESCRIPTOR_TYPE]: (
		service: T,
		members: Members,
	) => readonly [T, Members];
}

type RpcMemberInteraction =
	| Readonly<{ kind: "unary"; cancelable: boolean }>
	| Readonly<{ kind: "stream-method" }>
	| Readonly<{ kind: "stream-property" }>;

type RemoteServiceDescriptorData = Readonly<{
	serviceIdentifier: ServiceIdentifier<unknown>;
	wireName: string;
	members: Readonly<Record<string, RpcMemberInteraction>>;
}>;

const remoteServiceDescriptorData = new WeakMap<
	object,
	RemoteServiceDescriptorData
>();

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function readEnumerableDataProperty(
	record: object,
	key: PropertyKey,
	label: string,
): unknown {
	const property = Object.getOwnPropertyDescriptor(record, key);
	if (
		property === undefined ||
		!property.enumerable ||
		!("value" in property)
	) {
		throw new TypeError(`${label} must be an own enumerable data property.`);
	}
	return property.value;
}

function snapshotMemberDefinition(value: unknown): RpcMemberInteraction {
	if (!isPlainRecord(value)) {
		throw new TypeError("member definition must be a plain record.");
	}
	const keys = Reflect.ownKeys(value);
	if (keys.some((key) => typeof key !== "string")) {
		throw new TypeError("member definition fields must be strings.");
	}
	const kind = readEnumerableDataProperty(value, "kind", "kind");
	if (kind === "unary") {
		if (keys.length === 1 && keys[0] === "kind") {
			return Object.freeze({ kind, cancelable: false });
		}
		const cancelable = readEnumerableDataProperty(
			value,
			"cancelable",
			"cancelable",
		);
		const keysAreExact =
			keys.length === 2 && keys.includes("kind") && keys.includes("cancelable");
		if (!keysAreExact || cancelable !== true) {
			throw new TypeError(
				"cancelable unary definition must be exact and true.",
			);
		}
		return Object.freeze({ kind, cancelable: true });
	}
	const streamKindIsValid =
		kind === "stream-method" || kind === "stream-property";
	if (!streamKindIsValid || keys.length !== 1 || keys[0] !== "kind") {
		throw new TypeError("stream definition must contain only its valid kind.");
	}
	return Object.freeze({ kind });
}

export function createRemoteServiceDescriptor<
	T,
	const Members extends RpcMemberDefinitions<T>,
>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: {
		readonly wireName: string;
		readonly members: Members &
			ValidateMemberDefinitions<T, Members> &
			NonEmptyMemberDefinitions<Members>;
	},
): IRemoteServiceDescriptor<T, Members> {
	const wireNameBytes = new TextEncoder().encode(options.wireName).byteLength;
	if (wireNameBytes < 1 || wireNameBytes > 256) {
		throw new TypeError("wireName must contain 1..256 UTF-8 bytes.");
	}
	if (!isPlainRecord(options.members)) {
		throw new TypeError("members must be a plain record.");
	}
	const keys = Reflect.ownKeys(options.members);
	if (keys.length === 0) {
		throw new TypeError("members must select at least one member.");
	}
	const snapshot = Object.create(null) as Record<string, RpcMemberInteraction>;
	for (const member of keys) {
		if (
			typeof member !== "string" ||
			member.length === 0 ||
			member === "then"
		) {
			throw new TypeError(
				"members must use non-empty string names other than then.",
			);
		}
		const definition = readEnumerableDataProperty(
			options.members,
			member,
			`member ${member}`,
		);
		const interaction = snapshotMemberDefinition(definition);
		if (interaction.kind === "stream-property" && !member.endsWith("$")) {
			throw new TypeError("stream property names must end with $.");
		}
		snapshot[member] = interaction;
	}
	const descriptor = Object.freeze(
		Object.create(null),
	) as IRemoteServiceDescriptor<T, Members>;
	remoteServiceDescriptorData.set(
		descriptor,
		Object.freeze({
			serviceIdentifier: serviceIdentifier as ServiceIdentifier<unknown>,
			wireName: options.wireName,
			members: Object.freeze(snapshot),
		}),
	);
	return descriptor;
}

function getRemoteServiceDescriptorData(
	descriptor: unknown,
): RemoteServiceDescriptorData {
	if (typeof descriptor !== "object" || descriptor === null) {
		throw new TypeError("descriptor must be created by this prototype.");
	}
	const data = remoteServiceDescriptorData.get(descriptor);
	if (data === undefined) {
		throw new TypeError("descriptor must be created by this prototype.");
	}
	return data;
}

export type RpcApplicationValue =
	| null
	| boolean
	| string
	| number
	| readonly RpcApplicationValue[]
	| IRpcApplicationRecord;

export interface IRpcApplicationRecord {
	readonly [key: string]: RpcApplicationValue;
}

declare const RPC_APPLICATION_SNAPSHOT_TYPE: unique symbol;

export interface IRpcApplicationSnapshot<
	T extends RpcApplicationValue = RpcApplicationValue,
> {
	readonly value: T;
	readonly weight: number;
	readonly [RPC_APPLICATION_SNAPSHOT_TYPE]: never;
}

export interface IRpcApplicationArgumentsSnapshot
	extends IRpcApplicationSnapshot<readonly RpcApplicationValue[]> {}

export interface IRpcConnection {
	readonly message$: Observable<Uint8Array>;
	send(message: Uint8Array): Promise<void>;
	close(): Promise<void>;
}

export interface IRpcProtocolInvocationRequest {
	readonly service: string;
	readonly member: string;
	readonly args: IRpcApplicationArgumentsSnapshot;
}

export interface IRpcProtocolInvocationSink {
	finish(outcome: { readonly type: "returned" | "failed" }): void;
}

export interface IRpcProtocolInvocation {
	start(): void;
	cancel(): void;
}

export interface IRpcProtocolInvocationReservation {
	commit(sink: IRpcProtocolInvocationSink): IRpcProtocolInvocation;
	release(): void;
}

export type RpcProtocolStreamRequest =
	| {
			readonly service: string;
			readonly member: string;
			readonly kind: "stream-method";
			readonly args: IRpcApplicationArgumentsSnapshot;
	  }
	| {
			readonly service: string;
			readonly member: string;
			readonly kind: "stream-property";
	  };

export type RpcStreamOutcome =
	| { readonly type: "completed" }
	| { readonly type: "canceled" }
	| { readonly type: "failed"; readonly code: RpcStreamFailure };

export type RpcStreamItemEffect = "rearm" | "closed";

export interface IRpcProtocolProjection<TResult = void> {
	commit(): TResult;
}

export interface IRpcProtocolSubscriberSink {
	reserveItem(
		value: IRpcApplicationSnapshot,
	): IRpcProtocolProjection<RpcStreamItemEffect>;
	reserveTerminal(outcome: RpcStreamOutcome): IRpcProtocolProjection;
}

export interface IRpcProtocolStreamReservation {
	commit(sink: IRpcProtocolSubscriberSink): IRpcProtocolStream;
	release(): void;
}

export interface IRpcProtocolStream {
	start(): void;
	cancel(): void;
}

export type RpcSourceTerminal =
	| { readonly type: "completed" }
	| { readonly type: "failed"; readonly code: "handler-failed" };

export interface IRpcProtocolSourceEmissionReservation {
	commit(value: IRpcApplicationSnapshot): void;
	fail(): void;
}

export interface IRpcProtocolSourceSink {
	reserveEmission(): IRpcProtocolSourceEmissionReservation | undefined;
	finish(outcome: RpcSourceTerminal): void;
}

export type RpcIncomingStreamTerminal =
	| { readonly type: "completed" }
	| { readonly type: "canceled" }
	| {
			readonly type: "failed";
			readonly code:
				| "handler-failed"
				| "unknown-service"
				| "unknown-member"
				| "overflow";
	  }
	| { readonly type: "session-terminated" };

export interface IRpcProtocolIncomingStream {
	finish(outcome: RpcIncomingStreamTerminal, onReleased: () => void): void;
}

export interface IRpcProtocolIncomingSourceReservation {
	commit(source: IRpcProtocolSourceSink): IRpcProtocolIncomingStream;
	release(): void;
}

export interface IRpcProtocolIncomingUnknownStreamReservation {
	commit(): IRpcProtocolIncomingStream;
	release(): void;
}

export type RpcProtocolIncomingStreamReservation =
	| {
			readonly kind: "source";
			readonly reservation: IRpcProtocolIncomingSourceReservation;
	  }
	| {
			readonly kind: "unknown";
			readonly code: "unknown-service" | "unknown-member";
			readonly reservation: IRpcProtocolIncomingUnknownStreamReservation;
	  };

export interface IRpcProtocolSession {
	reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined;
	reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined;
	forceClose(): void;
}

export interface IRpcProtocolSessionHost {
	reserveIncomingStream(
		request: RpcProtocolStreamRequest,
	): RpcProtocolIncomingStreamReservation | undefined;
}

export interface IRpcProtocolRoleRuntime {
	shutdown(): Promise<void>;
	close(): void;
	cleanup(): Promise<void>;
}

export interface IRpcProtocolConnectorRuntime extends IRpcProtocolRoleRuntime {
	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export interface IRpcProtocolAcceptorRuntime extends IRpcProtocolRoleRuntime {
	accept(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export type IRpcProtocolConnectorHost = Record<never, never>;
export type IRpcProtocolAcceptorHost = Record<never, never>;

export interface IRpcProtocol {
	createConnector(
		host: IRpcProtocolConnectorHost,
	): IRpcProtocolConnectorRuntime;
	createAcceptor(host: IRpcProtocolAcceptorHost): IRpcProtocolAcceptorRuntime;
}

/** Proposed final runtime Object.keys(@husky-di/remote), sorted. */
export const PROPOSED_ROOT_RUNTIME_EXPORTS = Object.freeze([
	"RpcAcceptorListenerStopReasonEnum",
	"RpcCallStatusEnum",
	"RpcCloseOutcomeEnum",
	"RpcCloseReasonEnum",
	"RpcConnectorReconnectionAttemptFailureStageEnum",
	"RpcConnectorReconnectionEventTypeEnum",
	"RpcConnectorReconnectionStopReasonEnum",
	"RpcEventDirectionEnum",
	"RpcEventTypeEnum",
	"RpcException",
	"RpcExceptionCodeEnum",
	"RpcStateStatusEnum",
	"RpcStreamStatusEnum",
	"createRemoteServiceDescriptor",
	"createRpcAcceptor",
	"createRpcConnector",
	"createRpcConnectorReconnection",
	"createRpcProtocol",
] as const);

/** Proposed final type-only exports from @husky-di/remote, sorted. */
export const PROPOSED_ROOT_TYPE_EXPORTS = Object.freeze([
	"CreateRpcConnectorReconnectionOptions",
	"IRemoteServiceDescriptor",
	"IRpcAcceptor",
	"IRpcAcceptorAdapter",
	"IRpcApplicationRecord",
	"IRpcConnection",
	"IRpcConnector",
	"IRpcConnectorAdapter",
	"IRpcConnectorReconnection",
	"IRpcPeer",
	"IRpcProtocol",
	"IRpcProtocolRuntimePolicy",
	"RpcAcceptorListenerState",
	"RpcAcceptorOptions",
	"RpcAcceptorRuntimePolicyOptions",
	"RpcAcceptorState",
	"RpcApplicationValue",
	"RpcCallFailure",
	"RpcConnectorAdapterFactory",
	"RpcConnectorConnectOptions",
	"RpcConnectorOptions",
	"RpcConnectorReconnectionEvent",
	"RpcConnectorReconnectionPolicyOptions",
	"RpcConnectorReconnectionState",
	"RpcConnectorRuntimePolicyOptions",
	"RpcConnectorState",
	"RpcEvent",
	"RpcPeerState",
	"RpcProtocolFaultReason",
	"RpcSessionCloseReason",
] as const);

export const PROPOSED_PROTOCOL_RUNTIME_EXPORTS = Object.freeze([
	"RpcCallTerminalTypeEnum",
	"RpcCloseReasonEnum",
	"RpcExceptionCodeEnum",
	"RpcIncomingCallKindEnum",
	"RpcProtocolSessionTransitionTypeEnum",
	"createRpcProtocol",
] as const);

export const PROPOSED_TRANSPORT_RUNTIME_EXPORTS = Object.freeze([] as const);

export const PROPOSED_PROTOCOL_STREAM_TYPE_ADDITIONS = Object.freeze([
	"IRpcProtocolIncomingSourceReservation",
	"IRpcProtocolIncomingStream",
	"IRpcProtocolIncomingUnknownStreamReservation",
	"IRpcProtocolProjection",
	"IRpcProtocolSourceEmissionReservation",
	"IRpcProtocolSourceSink",
	"IRpcProtocolStream",
	"IRpcProtocolStreamReservation",
	"IRpcProtocolSubscriberSink",
	"RpcIncomingStreamTerminal",
	"RpcProtocolIncomingStreamReservation",
	"RpcProtocolStreamRequest",
	"RpcSourceTerminal",
	"RpcStreamFailure",
	"RpcStreamItemEffect",
	"RpcStreamOutcome",
] as const);

/**
 * Observed baseline, not a pass claim: production still contains these names
 * until the later implementation change replaces the unary draft atomically.
 */
export const CURRENT_PRODUCTION_NEGATIVE_BASELINE = Object.freeze([
	"RpcCallDirectionEnum is still a root runtime export",
	"RpcPeerResult is still a root type export",
	"IRpcAcceptor.resolveAll still exists",
	"RpcExceptionCodeEnum.unknownMethod still exists",
	"maxPendingInvocationsPerSession still exists",
	"current production packed NodeNext .mts/.cts final-surface acceptance has not run",
] as const);

type TraceEntry = Readonly<{
	step: number;
	name: string;
	streamId?: string | undefined;
	observationId?: string | undefined;
	sequence?: number | undefined;
}>;

class TraceLog {
	readonly entries: TraceEntry[] = [];
	#step = 0;

	public add(
		name: string,
		context: Omit<TraceEntry, "step" | "name"> = {},
	): void {
		this.entries.push(Object.freeze({ step: ++this.#step, name, ...context }));
	}

	public count(name: string): number {
		return this.entries.filter((entry) => entry.name === name).length;
	}

	public first(name: string): number {
		return this.entries.find((entry) => entry.name === name)?.step ?? -1;
	}
}

class PrototypeClock {
	#now = 0;

	public read(): number {
		return this.#now;
	}

	public tick(): number {
		this.#now += 1;
		return this.#now;
	}
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(`Prototype assertion failed: ${message}`);
	}
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
	if (!Object.is(actual, expected)) {
		throw new Error(
			`Prototype assertion failed: ${message}; expected=${String(expected)} actual=${String(actual)}`,
		);
	}
}

function assertArrayEqual(
	actual: readonly unknown[],
	expected: readonly unknown[],
	message: string,
): void {
	assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

function assertBefore(traceLog: TraceLog, first: string, second: string): void {
	const firstStep = traceLog.first(first);
	const secondStep = traceLog.first(second);
	assert(firstStep >= 0, `missing trace ${first}`);
	assert(secondStep >= 0, `missing trace ${second}`);
	assert(firstStep < secondStep, `${first} must precede ${second}`);
}

async function flushMicrotasks(rounds = 6): Promise<void> {
	for (let index = 0; index < rounds; index += 1) {
		await Promise.resolve();
	}
}

type MutableMetrics = {
	argumentInspections: number;
	localAdmissions: number;
	outgoingAdmissions: number;
	remoteAdmissions: number;
	streamIdentities: number;
	wireStarts: number;
	wireCancels: number;
	forceEgress: number;
	methodAcquisitions: number;
	getterAcquisitions: number;
	sourceSubscriptions: number;
	sourceTeardowns: number;
	sourceTeardownFailures: number;
	normalizedSourceValues: number;
	observerDeliveries: number;
	replayedBodies: number;
	suppressedReplays: number;
	localResources: number;
	sourceResources: number;
};

function createMetrics(): MutableMetrics {
	return {
		argumentInspections: 0,
		localAdmissions: 0,
		outgoingAdmissions: 0,
		remoteAdmissions: 0,
		streamIdentities: 0,
		wireStarts: 0,
		wireCancels: 0,
		forceEgress: 0,
		methodAcquisitions: 0,
		getterAcquisitions: 0,
		sourceSubscriptions: 0,
		sourceTeardowns: 0,
		sourceTeardownFailures: 0,
		normalizedSourceValues: 0,
		observerDeliveries: 0,
		replayedBodies: 0,
		suppressedReplays: 0,
		localResources: 0,
		sourceResources: 0,
	};
}

function normalizeApplicationValue(value: unknown): RpcApplicationValue {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string" ||
		(typeof value === "number" && Number.isFinite(value))
	) {
		return value;
	}
	if (Array.isArray(value)) {
		return Object.freeze(value.map(normalizeApplicationValue));
	}
	if (!isPlainRecord(value)) {
		throw new TypeError("value must be an Application Value.");
	}
	const snapshot = Object.create(null) as Record<string, RpcApplicationValue>;
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new TypeError("Application Value records require string keys.");
		}
		const property = Object.getOwnPropertyDescriptor(value, key);
		if (property === undefined || !("value" in property)) {
			throw new TypeError("Application Value records require data properties.");
		}
		snapshot[key] = normalizeApplicationValue(property.value);
	}
	return Object.freeze(snapshot);
}

function createSnapshot(value: unknown): IRpcApplicationSnapshot {
	const normalized = normalizeApplicationValue(value);
	return Object.freeze({
		value: normalized,
		weight: JSON.stringify(normalized).length,
	}) as IRpcApplicationSnapshot;
}

function createArgumentsSnapshot(
	values: readonly unknown[],
): IRpcApplicationArgumentsSnapshot {
	const normalized = Object.freeze(values.map(normalizeApplicationValue));
	return Object.freeze({
		value: normalized,
		weight: JSON.stringify(normalized).length,
	}) as IRpcApplicationArgumentsSnapshot;
}

type RpcEventPublication = Readonly<{
	event: RpcEvent;
	hasAuthority: () => boolean;
}>;

const eventAlwaysHasAuthority = (): boolean => true;

class SerializedEventBus {
	readonly #subject = new Subject<RpcEventPublication>();
	readonly #observable = new Observable<RpcEvent>((subscriber) =>
		this.#subject.subscribe({
			complete: () => subscriber.complete(),
			error: (error: unknown) => subscriber.error(error),
			next: (publication) => {
				if (publication.hasAuthority()) {
					subscriber.next(publication.event);
				}
			},
		}),
	);
	readonly #queue: RpcEventPublication[] = [];
	#dispatching = false;
	#completionRequested = false;
	#completed = false;
	readonly events: RpcEvent[] = [];

	public get observable(): Observable<RpcEvent> {
		return this.#observable;
	}

	public emit(event: RpcEvent, hasAuthority = eventAlwaysHasAuthority): void {
		if (this.#completed || this.#completionRequested) {
			return;
		}
		this.#queue.push(
			Object.freeze({ event: Object.freeze(event), hasAuthority }),
		);
		if (this.#dispatching) {
			return;
		}
		this.#dispatching = true;
		try {
			while (this.#queue.length > 0) {
				const next = this.#queue.shift();
				if (next === undefined) {
					continue;
				}
				if (!next.hasAuthority()) {
					continue;
				}
				this.events.push(next.event);
				this.#subject.next(next);
			}
		} finally {
			this.#dispatching = false;
		}
		if (this.#completionRequested && !this.#completed) {
			this.#completed = true;
			this.#subject.complete();
		}
	}

	public complete(): void {
		if (this.#completed || this.#completionRequested) {
			return;
		}
		this.#completionRequested = true;
		if (!this.#dispatching) {
			this.#completed = true;
			this.#subject.complete();
		}
	}
}

type MethodRoute =
	| Readonly<{
			kind: "unary";
			cancelable: boolean;
			invoke: (args: readonly unknown[]) => unknown;
	  }>
	| Readonly<{
			kind: "stream-method";
			invoke: (args: readonly unknown[]) => unknown;
	  }>;

type PropertyRoute = Readonly<{
	kind: "stream-property";
	sourceKind: "data" | "getter";
	acquire: () => unknown;
}>;

type ExposureRoute = MethodRoute | PropertyRoute;
type Exposure = Readonly<{
	routes: Readonly<Record<string, ExposureRoute>>;
}>;

function findPropertyDescriptor(
	implementation: object,
	member: string,
): PropertyDescriptor | undefined {
	let target: object | null = implementation;
	while (target !== null) {
		const property = Object.getOwnPropertyDescriptor(target, member);
		if (property !== undefined) {
			return property;
		}
		target = Object.getPrototypeOf(target);
	}
	return undefined;
}

function prepareExposure(
	data: RemoteServiceDescriptorData,
	implementation: object,
): Exposure {
	const routes = Object.create(null) as Record<string, ExposureRoute>;
	for (const [member, interaction] of Object.entries(data.members)) {
		const property = findPropertyDescriptor(implementation, member);
		if (property === undefined) {
			throw new TypeError(
				`selected implementation member ${member} is missing.`,
			);
		}
		if (interaction.kind !== "stream-property") {
			if (!("value" in property) || typeof property.value !== "function") {
				throw new TypeError(
					`selected implementation method ${member} must be a data function.`,
				);
			}
			const method = property.value as (...args: unknown[]) => unknown;
			const invoke = (args: readonly unknown[]) =>
				Reflect.apply(method, implementation, args);
			routes[member] =
				interaction.kind === "unary"
					? Object.freeze({
							kind: "unary" as const,
							cancelable: interaction.cancelable,
							invoke,
						})
					: Object.freeze({ kind: "stream-method" as const, invoke });
			continue;
		}
		if ("value" in property) {
			if (!isObservable(property.value)) {
				throw new TypeError(
					`selected implementation property ${member} must contain an Observable.`,
				);
			}
			const capturedSource = property.value;
			routes[member] = Object.freeze({
				kind: "stream-property",
				sourceKind: "data",
				acquire: () => capturedSource,
			});
			continue;
		}
		if (typeof property.get !== "function" || property.set !== undefined) {
			throw new TypeError(
				`selected implementation property ${member} must be data or getter-only.`,
			);
		}
		const getter = property.get;
		routes[member] = Object.freeze({
			kind: "stream-property",
			sourceKind: "getter",
			acquire: () => Reflect.apply(getter, implementation, []),
		});
	}
	return Object.freeze({ routes: Object.freeze(routes) });
}

type RpcPeerStatePublication = Readonly<{
	generation: number;
	state: RpcPeerState;
}>;

class SideRuntime {
	readonly eventBus = new SerializedEventBus();
	readonly exposures = new Map<string, Exposure>();
	readonly #stateSubject = new BehaviorSubject<RpcPeerStatePublication>(
		Object.freeze({
			generation: 0,
			state: Object.freeze<RpcPeerState>({ status: "connected" }),
		}),
	);
	#stateGeneration = 0;
	readonly state$ = new Observable<RpcPeerState>((subscriber) =>
		this.#stateSubject.subscribe((publication) => {
			// Suppress a synchronous state broadcast superseded by reentrant authority.
			const publicationIsCurrent =
				publication.generation === this.#stateGeneration;
			if (publicationIsCurrent) {
				subscriber.next(publication.state);
			}
		}),
	);
	peer!: PrototypeRpcPeer;

	public get state(): RpcPeerState {
		return this.#stateSubject.value.state;
	}

	public setState(state: RpcPeerState): void {
		this.#stateGeneration += 1;
		this.#stateSubject.next(
			Object.freeze({
				generation: this.#stateGeneration,
				state: Object.freeze(state),
			}),
		);
	}
}

type SubscriberSinkHooks = Readonly<{
	readonly isObservationOpen: () => boolean;
	readonly onItemEffect: () => void;
	readonly onTerminalEffect: () => void;
}>;

class FrameworkSubscriberSink implements IRpcProtocolSubscriberSink {
	readonly #subscriber: Subscriber<RpcApplicationValue>;
	readonly #hooks: SubscriberSinkHooks;

	public constructor(
		subscriber: Subscriber<RpcApplicationValue>,
		hooks: SubscriberSinkHooks,
	) {
		this.#subscriber = subscriber;
		this.#hooks = hooks;
	}

	public reserveItem(
		value: IRpcApplicationSnapshot,
	): IRpcProtocolProjection<RpcStreamItemEffect> {
		return Object.freeze({
			commit: (): RpcStreamItemEffect => {
				if (!this.#hooks.isObservationOpen() || this.#subscriber.closed) {
					return "closed";
				}
				this.#hooks.onItemEffect();
				this.#subscriber.next(value.value);
				return this.#hooks.isObservationOpen() && !this.#subscriber.closed
					? "rearm"
					: "closed";
			},
		});
	}

	public reserveTerminal(outcome: RpcStreamOutcome): IRpcProtocolProjection {
		return Object.freeze({
			commit: (): void => {
				if (!this.#hooks.isObservationOpen() || this.#subscriber.closed) {
					return;
				}
				this.#hooks.onTerminalEffect();
				if (outcome.type === "completed") {
					this.#subscriber.complete();
					return;
				}
				if (outcome.type === "failed") {
					this.#subscriber.error(new RpcException(outcome.code));
				}
			},
		});
	}
}

type RetainedItemEvidence = Readonly<{
	kind: "item";
	sequence: number;
	itemOrdinal: number;
	snapshot: IRpcApplicationSnapshot;
	bodyFingerprint: string;
}>;

type RetainedTerminalEvidence = Readonly<{
	kind: "terminal";
	sequence: number;
	boundary: number;
	outcome: RpcStreamOutcome;
	bodyFingerprint: string;
}>;

type RetainedStreamEvidence = RetainedItemEvidence | RetainedTerminalEvidence;

class FrameworkIncomingStream implements IRpcProtocolIncomingStream {
	readonly #metrics: MutableMetrics;
	readonly #traceLog: TraceLog;
	readonly #streamId: () => string | undefined;
	#subscription: Subscription | undefined;
	#subscribeReturned = false;
	#finishRequested = false;
	#teardownAttempted = false;
	#released = false;
	#teardownFailed = false;
	#onReleased: (() => void) | undefined;

	public constructor(
		metrics: MutableMetrics,
		traceLog: TraceLog,
		streamId: () => string | undefined,
	) {
		this.#metrics = metrics;
		this.#traceLog = traceLog;
		this.#streamId = streamId;
	}

	public attachSubscription(subscription: Subscription): void {
		this.#subscription = subscription;
		this.#subscribeReturned = true;
		if (this.#finishRequested) {
			this.#unsubscribeAndRelease();
		}
	}

	public recordSubscribeThrow(teardownFailure: boolean): void {
		if (teardownFailure) {
			this.#teardownFailed = true;
			this.#metrics.sourceTeardownFailures += 1;
		}
		this.#subscribeReturned = true;
		if (this.#finishRequested) {
			this.#recordTeardownAttempt();
			this.#release();
		}
	}

	public finish(
		_outcome: RpcIncomingStreamTerminal,
		onReleased: () => void,
	): void {
		if (this.#finishRequested) {
			return;
		}
		this.#finishRequested = true;
		this.#onReleased = onReleased;
		this.#traceLog.add("source.fenced", { streamId: this.#streamId() });
		if (this.#subscribeReturned) {
			this.#unsubscribeAndRelease();
		}
	}

	public get teardownFailed(): boolean {
		return this.#teardownFailed;
	}

	#unsubscribeAndRelease(): void {
		this.#recordTeardownAttempt();
		try {
			this.#subscription?.unsubscribe();
		} catch {
			if (!this.#teardownFailed) {
				this.#teardownFailed = true;
				this.#metrics.sourceTeardownFailures += 1;
			}
		}
		this.#release();
	}

	#recordTeardownAttempt(): void {
		if (this.#teardownAttempted) {
			return;
		}
		this.#teardownAttempted = true;
		this.#traceLog.add("source.teardown-attempt", {
			streamId: this.#streamId(),
		});
	}

	#release(): void {
		if (this.#released) {
			return;
		}
		this.#released = true;
		this.#metrics.sourceTeardowns += 1;
		this.#traceLog.add("source.teardown-released", {
			streamId: this.#streamId(),
		});
		this.#traceLog.add("source.on-released", {
			streamId: this.#streamId(),
		});
		this.#onReleased?.();
	}
}

type SourceTerminalWinner =
	| { readonly type: "completed" }
	| { readonly type: "canceled" }
	| { readonly type: "terminated" }
	| {
			readonly type: "failed";
			readonly code:
				| typeof RpcExceptionCodeEnum.handlerFailed
				| typeof RpcExceptionCodeEnum.overflow;
	  };

function toSubscriberOutcome(winner: SourceTerminalWinner): RpcStreamOutcome {
	if (winner.type === "completed") {
		return { type: "completed" };
	}
	if (winner.type === "canceled") {
		return { type: "canceled" };
	}
	if (winner.type === "terminated") {
		return { type: "failed", code: RpcExceptionCodeEnum.outcomeUnknown };
	}
	return { type: "failed", code: winner.code };
}

function toIncomingOutcome(
	winner: SourceTerminalWinner,
): RpcIncomingStreamTerminal {
	if (winner.type === "completed") {
		return { type: "completed" };
	}
	if (winner.type === "canceled") {
		return { type: "canceled" };
	}
	if (winner.type === "terminated") {
		return { type: "session-terminated" };
	}
	return { type: "failed", code: winner.code };
}

class PrototypeSession {
	readonly metrics = createMetrics();
	readonly traceLog = new TraceLog();
	readonly clock = new PrototypeClock();
	readonly left = new SideRuntime();
	readonly right = new SideRuntime();
	readonly activeStreams = new Set<LogicalStream>();
	readonly pendingStreams = new Set<LogicalStream>();
	readonly capturedStreams = new Set<LogicalStream>();
	readonly queuedSourceJobs = new Set<LogicalStream>();
	#nextLeftStreamOrdinal = 0;
	#nextRightStreamOrdinal = 0;
	#nextSequence = 0;
	#nextObservationId = 0;
	#bindingGeneration = 0;
	#recoveryContinuationGeneration = 0;
	#bindingProgress = 0;
	#recovering = false;
	#recoveryGateClosed = false;
	#graceful = false;
	#forced = false;
	#terminationFinalized = false;
	#forceReason = "forced-close";
	#terminationTask: Promise<void> | undefined;
	#resolveTermination: (() => void) | undefined;

	public rejectNextLocal = false;
	public rejectNextIncomingResource = false;
	public deferRemoteAdmission = false;
	public deferSourceJobs = false;

	public constructor() {
		this.left.peer = new PrototypeRpcPeer(this, this.left);
		this.right.peer = new PrototypeRpcPeer(this, this.right);
	}

	public other(side: SideRuntime): SideRuntime {
		return side === this.left ? this.right : this.left;
	}

	public isRecovering(): boolean {
		return this.#recovering;
	}

	public isForced(): boolean {
		return this.#forced;
	}

	public captureBindingGeneration(): number {
		return this.#bindingGeneration;
	}

	public get bindingProgress(): number {
		return this.#bindingProgress;
	}

	public canSubscribe(side: SideRuntime): boolean {
		const status = side.state.status;
		return (
			!this.#graceful &&
			!this.#forced &&
			(status === "connected" || status === "recovering")
		);
	}

	public reserveStream(
		origin: SideRuntime,
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined {
		if (this.rejectNextLocal) {
			this.rejectNextLocal = false;
			return undefined;
		}
		return new MinimalStreamReservation(this, origin, request);
	}

	public commitLocalStream(
		origin: SideRuntime,
		request: RpcProtocolStreamRequest,
		sink: IRpcProtocolSubscriberSink,
	): LogicalStream {
		const stream = new LogicalStream(this, origin, request, sink);
		this.activeStreams.add(stream);
		this.metrics.localAdmissions += 1;
		this.metrics.localResources += 1;
		stream.commitLocalAdmission(this.nextObservationId());
		return stream;
	}

	public nextObservationId(): string {
		this.#nextObservationId += 1;
		return `observation-${this.#nextObservationId}`;
	}

	public allocateStreamId(origin: SideRuntime): string {
		if (origin === this.left) {
			this.#nextLeftStreamOrdinal += 1;
			return `left/${this.#nextLeftStreamOrdinal}`;
		}
		this.#nextRightStreamOrdinal += 1;
		return `right/${this.#nextRightStreamOrdinal}`;
	}

	public allocateSequence(): number {
		this.#nextSequence += 1;
		return this.#nextSequence;
	}

	public beginStream(stream: LogicalStream): void {
		if (this.#recovering) {
			this.pendingStreams.add(stream);
			this.traceLog.add("pending.identity-free");
			return;
		}
		stream.beginOutgoingAdmission();
	}

	public captureBeforeRemoteAdmission(stream: LogicalStream): void {
		this.capturedStreams.add(stream);
	}

	public queueSourceJob(stream: LogicalStream): void {
		this.queuedSourceJobs.add(stream);
	}

	public dispatchCapturedAdmissions(): void {
		if (this.#graceful || this.#forced) {
			this.traceLog.add("late.remote-admission.ignored");
			return;
		}
		for (const stream of [...this.capturedStreams]) {
			this.capturedStreams.delete(stream);
			stream.completeRemoteAdmission();
		}
	}

	public dispatchSourceJobs(): void {
		if (this.#forced || (this.#graceful && this.#recovering)) {
			this.traceLog.add("late.source-job.ignored");
			return;
		}
		for (const stream of [...this.queuedSourceJobs]) {
			this.queuedSourceJobs.delete(stream);
			stream.dispatchSourceJob();
		}
	}

	public enterRecovery(): void {
		if (
			this.#recovering ||
			this.#recoveryGateClosed ||
			this.#graceful ||
			this.#forced
		) {
			return;
		}
		this.#bindingGeneration += 1;
		const generation = ++this.#recoveryContinuationGeneration;
		const continuationHasAuthority = (): boolean =>
			this.recoveryContinuationHasAuthority(generation);
		this.#recovering = true;
		for (const side of [this.left, this.right]) {
			if (!this.recoveryContinuationHasAuthority(generation)) {
				this.traceLog.add("recovery.entry.invalidated");
				return;
			}
			side.setState({ status: "recovering" });
			if (!this.recoveryContinuationHasAuthority(generation)) {
				this.traceLog.add("recovery.entry.invalidated");
				return;
			}
			side.eventBus.emit(
				{
					type: RpcEventTypeEnum.peerRecovering,
					peer: side.peer,
				},
				continuationHasAuthority,
			);
			if (!this.recoveryContinuationHasAuthority(generation)) {
				this.traceLog.add("recovery.entry.invalidated");
				return;
			}
		}
		this.traceLog.add("recovery.enter");
	}

	public recover(): void {
		if (
			!this.#recovering ||
			this.#recoveryGateClosed ||
			this.#graceful ||
			this.#forced
		) {
			if (this.#recoveryGateClosed) {
				this.traceLog.add("late.recover-settlement.ignored");
			}
			return;
		}
		const generation = ++this.#recoveryContinuationGeneration;
		const continuationHasAuthority = (): boolean =>
			this.recoveryContinuationHasAuthority(generation);
		const stopIfInvalidated = (): boolean => {
			if (continuationHasAuthority()) {
				return false;
			}
			this.traceLog.add("recovery.continuation.invalidated");
			return true;
		};
		this.traceLog.add("recovery.barrier.start");
		for (const stream of [...this.activeStreams]) {
			if (stopIfInvalidated()) {
				return;
			}
			stream.replayRetainedEvidence(continuationHasAuthority);
			if (stopIfInvalidated()) {
				return;
			}
		}
		this.traceLog.add("recovery.barrier.end");
		if (stopIfInvalidated()) {
			return;
		}
		this.#recovering = false;
		for (const side of [this.left, this.right]) {
			if (stopIfInvalidated()) {
				return;
			}
			side.setState({ status: "connected" });
			if (stopIfInvalidated()) {
				return;
			}
			side.eventBus.emit(
				{
					type: RpcEventTypeEnum.peerRecovered,
					peer: side.peer,
				},
				continuationHasAuthority,
			);
			if (stopIfInvalidated()) {
				return;
			}
		}
		for (const stream of [...this.pendingStreams]) {
			if (stopIfInvalidated()) {
				return;
			}
			this.pendingStreams.delete(stream);
			stream.beginOutgoingAdmission();
			if (stopIfInvalidated()) {
				return;
			}
		}
	}

	public settleBootstrap(generation: number): void {
		if (!this.bindingSettlementHasAuthority(generation)) {
			this.traceLog.add("late.bootstrap-settlement.ignored");
			return;
		}
		this.#bindingProgress += 1;
		this.traceLog.add("bootstrap-settlement.authoritative");
		this.recover();
	}

	public settleSend(generation: number): void {
		if (!this.bindingSettlementHasAuthority(generation)) {
			this.traceLog.add("late.send-settlement.ignored");
			return;
		}
		this.#bindingProgress += 1;
		this.traceLog.add("send-settlement.authoritative");
	}

	private bindingSettlementHasAuthority(generation: number): boolean {
		return (
			generation === this.#bindingGeneration &&
			this.#recovering &&
			!this.#recoveryGateClosed &&
			!this.#graceful &&
			!this.#forced
		);
	}

	private recoveryContinuationHasAuthority(generation: number): boolean {
		return (
			generation === this.#recoveryContinuationGeneration &&
			!this.#recoveryGateClosed &&
			!this.#graceful &&
			!this.#forced
		);
	}

	public replayExact(stream: LogicalStream): void {
		stream.replayRetainedEvidence();
	}

	public replayAltered(stream: LogicalStream): void {
		stream.rejectAlteredReplay();
		this.forceClose("protocol-fault");
	}

	public shutdown(): Promise<void> {
		const terminationTask = this.getOrCreateTerminationTask();
		if (this.#graceful || this.#forced || this.#terminationFinalized) {
			return terminationTask;
		}
		// Identity-free Pending keeps G on the recovery-to-force branch.
		const recoveringAtGracefulCutoff =
			this.#recovering || this.pendingStreams.size > 0;
		this.#graceful = true;
		this.#recoveryGateClosed = true;
		this.#bindingGeneration += 1;
		const generation = ++this.#recoveryContinuationGeneration;
		const continuationHasAuthority = (): boolean =>
			this.gracefulContinuationHasAuthority(generation);
		const stopIfInvalidated = (): boolean => {
			if (continuationHasAuthority()) {
				return false;
			}
			this.traceLog.add("shutdown.continuation.invalidated");
			return true;
		};
		this.traceLog.add("shutdown.G");
		for (const side of [this.left, this.right]) {
			side.setState({ status: "draining" });
			if (stopIfInvalidated()) {
				return terminationTask;
			}
			side.eventBus.emit(
				{ type: RpcEventTypeEnum.ownerDraining },
				continuationHasAuthority,
			);
			if (stopIfInvalidated()) {
				return terminationTask;
			}
			side.eventBus.emit(
				{
					type: RpcEventTypeEnum.peerDraining,
					peer: side.peer,
					reason: "graceful-shutdown",
				},
				continuationHasAuthority,
			);
			if (stopIfInvalidated()) {
				return terminationTask;
			}
		}
		if (recoveringAtGracefulCutoff) {
			this.traceLog.add("shutdown.G.recovering-force");
			this.forceClose("graceful-shutdown");
			return terminationTask;
		}
		for (const stream of [...this.capturedStreams]) {
			if (stopIfInvalidated()) {
				return terminationTask;
			}
			this.capturedStreams.delete(stream);
			stream.rejectCapturedByGracefulCutoff();
			if (stopIfInvalidated()) {
				return terminationTask;
			}
		}
		this.maybeFinishGracefulShutdown();
		return terminationTask;
	}

	public close(reason = "forced-close"): Promise<void> {
		const terminationTask = this.getOrCreateTerminationTask();
		this.forceClose(reason);
		return terminationTask;
	}

	public forceClose(reason = "forced-close"): void {
		this.getOrCreateTerminationTask();
		if (this.#forced || this.#terminationFinalized) {
			return;
		}
		this.#forced = true;
		this.#recoveryGateClosed = true;
		this.#bindingGeneration += 1;
		this.#recoveryContinuationGeneration += 1;
		this.#forceReason = reason;
		this.#recovering = false;
		this.traceLog.add("force.F.batch-fence");
		const streams = [...this.activeStreams];
		for (const stream of streams) {
			stream.prepareForce();
		}
		for (const side of [this.left, this.right]) {
			side.setState({ status: "closed" });
			side.eventBus.emit({ type: RpcEventTypeEnum.ownerClosing });
		}
		for (const stream of streams) {
			stream.runForceEffects();
		}
		this.finishForceIfReady();
	}

	public finishForceIfReady(): void {
		if (
			!this.#forced ||
			this.#terminationFinalized ||
			this.activeStreams.size > 0
		) {
			return;
		}
		this.#terminationFinalized = true;
		for (const side of [this.left, this.right]) {
			side.eventBus.emit({
				type: RpcEventTypeEnum.peerClosed,
				peer: side.peer,
				outcome: "normal",
				reason: this.#forceReason,
			});
			side.eventBus.emit({
				type: RpcEventTypeEnum.topologyClosed,
				outcome: "normal",
				reason: this.#forceReason,
			});
			side.eventBus.complete();
		}
		this.#resolveTermination?.();
	}

	public streamConverged(stream: LogicalStream): void {
		this.activeStreams.delete(stream);
		this.pendingStreams.delete(stream);
		this.capturedStreams.delete(stream);
		this.queuedSourceJobs.delete(stream);
		this.maybeFinishGracefulShutdown();
		this.finishForceIfReady();
	}

	public maybeFinishGracefulShutdown(): void {
		if (
			!this.#graceful ||
			this.#forced ||
			this.#terminationFinalized ||
			this.activeStreams.size > 0
		) {
			return;
		}
		this.#terminationFinalized = true;
		this.traceLog.add("shutdown.drained");
		for (const side of [this.left, this.right]) {
			side.setState({ status: "closed" });
			side.eventBus.emit({
				type: RpcEventTypeEnum.peerClosed,
				peer: side.peer,
				outcome: "normal",
				reason: "graceful-shutdown",
			});
			side.eventBus.emit({
				type: RpcEventTypeEnum.topologyClosed,
				outcome: "normal",
				reason: "graceful-shutdown",
			});
			side.eventBus.complete();
		}
		this.#resolveTermination?.();
	}

	private getOrCreateTerminationTask(): Promise<void> {
		this.#terminationTask ??= new Promise<void>((resolve) => {
			this.#resolveTermination = resolve;
		});
		return this.#terminationTask;
	}

	private gracefulContinuationHasAuthority(generation: number): boolean {
		return (
			generation === this.#recoveryContinuationGeneration &&
			this.#graceful &&
			!this.#forced &&
			!this.#terminationFinalized
		);
	}
}

class MinimalStreamReservation implements IRpcProtocolStreamReservation {
	readonly #session: PrototypeSession;
	readonly #origin: SideRuntime;
	readonly #request: RpcProtocolStreamRequest;
	#settled = false;

	public constructor(
		session: PrototypeSession,
		origin: SideRuntime,
		request: RpcProtocolStreamRequest,
	) {
		this.#session = session;
		this.#origin = origin;
		this.#request = request;
	}

	public commit(sink: IRpcProtocolSubscriberSink): IRpcProtocolStream {
		if (this.#settled) {
			throw new Error("stream reservation already settled.");
		}
		this.#settled = true;
		return this.#session.commitLocalStream(this.#origin, this.#request, sink);
	}

	public release(): void {
		this.#settled = true;
	}
}

class SideProtocolSession implements IRpcProtocolSession {
	readonly #session: PrototypeSession;
	readonly #origin: SideRuntime;

	public constructor(session: PrototypeSession, origin: SideRuntime) {
		this.#session = session;
		this.#origin = origin;
	}

	public reserveInvocation(
		_request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		return undefined;
	}

	public reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined {
		return this.#session.reserveStream(this.#origin, request);
	}

	public forceClose(): void {
		this.#session.forceClose();
	}
}

class LogicalStream
	implements
		IRpcProtocolStream,
		IRpcProtocolSourceSink,
		IRpcProtocolSourceEmissionReservation
{
	readonly #session: PrototypeSession;
	readonly #origin: SideRuntime;
	readonly #sourceSide: SideRuntime;
	readonly #request: RpcProtocolStreamRequest;
	readonly #subscriberSink: IRpcProtocolSubscriberSink;
	#streamId: string | undefined;
	#outgoingObservationId = "";
	#incomingObservationId: string | undefined;
	#outgoingStartedAt = 0;
	#incomingStartedAt = 0;
	#outgoingAdmitted = false;
	#remoteAdmitted = false;
	#capturedRoute: ExposureRoute | undefined;
	#sourceJobStarted = false;
	#sourceFenced = false;
	#incomingControl: FrameworkIncomingStream | undefined;
	#sourceCreditAvailable = true;
	#admittedItemCount = 0;
	#dispositionFrontier = 0;
	#deliveredItemCount = 0;
	#retainedEvidence: RetainedStreamEvidence[] = [];
	#terminalWinner: SourceTerminalWinner | undefined;
	#terminalDispositionCommitted = false;
	#outgoingFinished = false;
	#incomingFinished = false;
	#callerUnsubscribed = false;
	#terminalEffectExpected = false;
	#localResourceHeld = true;
	#sourceResourceHeld = false;
	#forcePrepared = false;
	#forceEffectsRun = false;
	#itemEffectInProgress = false;
	#effectRunnerActive = false;
	#deferredEffectOne: (() => void) | undefined;
	#deferredEffectTwo: (() => void) | undefined;
	#preparedForceSubscriberEffect: (() => void) | undefined;
	#sourceFinishRequested = false;
	#converged = false;

	public constructor(
		session: PrototypeSession,
		origin: SideRuntime,
		request: RpcProtocolStreamRequest,
		subscriberSink: IRpcProtocolSubscriberSink,
	) {
		this.#session = session;
		this.#origin = origin;
		this.#sourceSide = session.other(origin);
		this.#request = request;
		this.#subscriberSink = subscriberSink;
	}

	public get identity(): string | undefined {
		return this.#streamId;
	}

	public get outgoingObservationId(): string {
		return this.#outgoingObservationId;
	}

	public get incomingObservationId(): string | undefined {
		return this.#incomingObservationId;
	}

	public get deliveredItemCount(): number {
		return this.#deliveredItemCount;
	}

	public get admittedItemCount(): number {
		return this.#admittedItemCount;
	}

	public get terminalWinner(): SourceTerminalWinner | undefined {
		return this.#terminalWinner;
	}

	public get observationOpen(): boolean {
		return !this.#callerUnsubscribed && !this.#terminalEffectExpected;
	}

	public commitLocalAdmission(observationId: string): void {
		this.#outgoingObservationId = observationId;
		this.#outgoingStartedAt = this.#session.clock.tick();
		this.#session.traceLog.add("telemetry.outgoing.started", {
			observationId,
		});
		this.#origin.eventBus.emit({
			type: RpcEventTypeEnum.streamStarted,
			observationId,
			peer: this.#origin.peer,
			direction: RpcEventDirectionEnum.outgoing,
			service: this.#request.service,
			member: this.#request.member,
		});
	}

	public start(): void {
		this.#session.beginStream(this);
	}

	public cancel(): void {
		if (this.#callerUnsubscribed) {
			return;
		}
		this.#callerUnsubscribed = true;
		if (this.#terminalDispositionCommitted) {
			this.#session.traceLog.add("cancel.suppressed-after-terminal", {
				streamId: this.#streamId,
			});
			return;
		}
		this.#terminalDispositionCommitted = true;
		this.#session.traceLog.add("cancel.disposition", {
			streamId: this.#streamId,
		});
		this.deferEffect(() => {
			try {
				this.commitOutgoingFinished({ type: "canceled" });
			} finally {
				this.releaseLocalResource();
			}
		});
		if (!this.#outgoingAdmitted) {
			this.#session.traceLog.add("cancel.pre-outgoing-retraction", {
				observationId: this.#outgoingObservationId,
			});
			this.releaseLocalResource();
			return;
		}
		this.#session.metrics.wireCancels += 1;
		this.#session.traceLog.add("cancel.intent", {
			streamId: this.#streamId,
		});
		if (this.#session.isRecovering()) {
			return;
		}
		this.commitSourceTerminal({ type: "canceled" });
	}

	public beginOutgoingAdmission(): void {
		if (
			this.#callerUnsubscribed ||
			this.#outgoingFinished ||
			this.#session.isForced()
		) {
			return;
		}
		this.#outgoingAdmitted = true;
		this.#streamId = this.#session.allocateStreamId(this.#origin);
		this.#session.metrics.outgoingAdmissions += 1;
		this.#session.metrics.streamIdentities += 1;
		this.#session.metrics.wireStarts += 1;
		this.#session.traceLog.add("outgoing.admission", {
			streamId: this.#streamId,
		});
		if (this.#session.rejectNextIncomingResource) {
			this.#session.rejectNextIncomingResource = false;
			this.projectPreAdmissionFailure(RpcExceptionCodeEnum.unavailable);
			return;
		}
		const exposure = this.#sourceSide.exposures.get(this.#request.service);
		if (exposure === undefined) {
			this.projectSemanticRejection(RpcExceptionCodeEnum.unknownService);
			return;
		}
		const route = exposure.routes[this.#request.member];
		const routeMatches =
			(this.#request.kind === "stream-method" &&
				route?.kind === "stream-method") ||
			(this.#request.kind === "stream-property" &&
				route?.kind === "stream-property");
		if (!routeMatches || route === undefined) {
			this.projectSemanticRejection(RpcExceptionCodeEnum.unknownMember);
			return;
		}
		this.#capturedRoute = route;
		this.#session.traceLog.add("remote.route-captured", {
			streamId: this.#streamId,
		});
		if (this.#session.deferRemoteAdmission) {
			this.#session.captureBeforeRemoteAdmission(this);
			return;
		}
		this.completeRemoteAdmission();
	}

	public completeRemoteAdmission(): void {
		if (
			this.#capturedRoute === undefined ||
			this.#remoteAdmitted ||
			this.#session.isForced()
		) {
			return;
		}
		this.#remoteAdmitted = true;
		this.#sourceResourceHeld = true;
		this.#session.metrics.remoteAdmissions += 1;
		this.#session.metrics.sourceResources += 1;
		this.#incomingObservationId = this.#session.nextObservationId();
		this.#incomingStartedAt = this.#session.clock.tick();
		this.#session.traceLog.add("telemetry.incoming.started", {
			streamId: this.#streamId,
			observationId: this.#incomingObservationId,
		});
		this.#sourceSide.eventBus.emit({
			type: RpcEventTypeEnum.streamStarted,
			observationId: this.#incomingObservationId,
			peer: this.#sourceSide.peer,
			direction: RpcEventDirectionEnum.incoming,
			service: this.#request.service,
			member: this.#request.member,
		});
		if (this.#session.deferSourceJobs) {
			this.#session.queueSourceJob(this);
			return;
		}
		this.dispatchSourceJob();
	}

	public dispatchSourceJob(): void {
		if (
			this.#sourceJobStarted ||
			!this.#remoteAdmitted ||
			this.#sourceFenced ||
			this.#terminalWinner !== undefined
		) {
			return;
		}
		this.#sourceJobStarted = true;
		this.#session.traceLog.add("source.job", { streamId: this.#streamId });
		const route = this.#capturedRoute;
		if (route === undefined) {
			this.commitSourceTerminal({
				type: "failed",
				code: RpcExceptionCodeEnum.handlerFailed,
			});
			return;
		}
		let source: unknown;
		try {
			if (route.kind === "stream-method") {
				this.#session.metrics.methodAcquisitions += 1;
				source = route.invoke(
					this.#request.kind === "stream-method"
						? this.#request.args.value
						: [],
				);
			} else if (route.kind === "stream-property") {
				if (route.sourceKind === "getter") {
					this.#session.metrics.getterAcquisitions += 1;
				}
				source = route.acquire();
			} else {
				throw new TypeError("captured stream route changed kind.");
			}
		} catch {
			this.commitSourceTerminal({
				type: "failed",
				code: RpcExceptionCodeEnum.handlerFailed,
			});
			return;
		}
		if (
			this.#sourceFenced ||
			this.#terminalWinner !== undefined ||
			this.#session.isForced()
		) {
			return;
		}
		if (!isObservable(source)) {
			this.commitSourceTerminal({
				type: "failed",
				code: RpcExceptionCodeEnum.handlerFailed,
			});
			return;
		}
		this.#session.metrics.sourceSubscriptions += 1;
		this.#incomingControl = new FrameworkIncomingStream(
			this.#session.metrics,
			this.#session.traceLog,
			() => this.#streamId,
		);
		try {
			const subscription = source.subscribe({
				complete: () => this.finish({ type: "completed" }),
				error: () => this.finish({ type: "failed", code: "handler-failed" }),
				next: (rawValue: unknown) => {
					if (this.#sourceFenced) {
						return;
					}
					const emission = this.reserveEmission();
					if (emission === undefined) {
						return;
					}
					try {
						this.#session.metrics.normalizedSourceValues += 1;
						emission.commit(createSnapshot(rawValue));
					} catch {
						emission.fail();
					}
				},
			});
			this.#incomingControl.attachSubscription(subscription);
		} catch {
			const terminalAlreadyWon = this.#terminalWinner !== undefined;
			if (!terminalAlreadyWon) {
				this.commitSourceTerminal({
					type: "failed",
					code: RpcExceptionCodeEnum.handlerFailed,
				});
			}
			this.#incomingControl.recordSubscribeThrow(terminalAlreadyWon);
		}
	}

	public reserveEmission(): IRpcProtocolSourceEmissionReservation | undefined {
		if (
			this.#sourceFenced ||
			this.#terminalWinner !== undefined ||
			this.#session.isForced()
		) {
			return undefined;
		}
		if (!this.#sourceCreditAvailable) {
			this.commitSourceTerminal({
				type: "failed",
				code: RpcExceptionCodeEnum.overflow,
			});
			return undefined;
		}
		this.#sourceCreditAvailable = false;
		return this;
	}

	public commit(snapshot: IRpcApplicationSnapshot): void {
		if (
			this.#sourceFenced ||
			this.#terminalWinner !== undefined ||
			this.#session.isForced()
		) {
			return;
		}
		this.#admittedItemCount += 1;
		const itemOrdinal = this.#admittedItemCount;
		const sequence = this.#session.allocateSequence();
		const evidence = Object.freeze({
			kind: "item" as const,
			sequence,
			itemOrdinal,
			snapshot,
			bodyFingerprint: JSON.stringify([itemOrdinal, snapshot.value]),
		});
		this.#retainedEvidence.push(evidence);
		this.#session.traceLog.add("item.admission", {
			streamId: this.#streamId,
			sequence,
		});
		if (!this.#session.isRecovering()) {
			this.deliverEvidence(evidence);
		}
	}

	public fail(): void {
		this.commitSourceTerminal({
			type: "failed",
			code: RpcExceptionCodeEnum.handlerFailed,
		});
	}

	public finish(outcome: RpcSourceTerminal): void {
		this.commitSourceTerminal(
			outcome.type === "completed"
				? { type: "completed" }
				: { type: "failed", code: RpcExceptionCodeEnum.handlerFailed },
		);
	}

	public get forceEffectPending(): boolean {
		return (
			this.#itemEffectInProgress ||
			this.#effectRunnerActive ||
			this.#deferredEffectOne !== undefined ||
			this.#deferredEffectTwo !== undefined ||
			this.#preparedForceSubscriberEffect !== undefined
		);
	}

	public rejectCapturedByGracefulCutoff(): void {
		if (this.#remoteAdmitted || this.#session.isForced()) {
			return;
		}
		this.#capturedRoute = undefined;
		this.#session.traceLog.add("shutdown.G.captured-rejected", {
			streamId: this.#streamId,
		});
		this.projectPreAdmissionFailure(RpcExceptionCodeEnum.unavailable);
	}

	public replayRetainedEvidence(
		continuationHasAuthority?: () => boolean,
	): void {
		for (const evidence of this.#retainedEvidence) {
			if (continuationHasAuthority?.() === false) {
				return;
			}
			this.#session.metrics.replayedBodies += 1;
			this.#session.traceLog.add("recovery.replay", {
				streamId: this.#streamId,
				sequence: evidence.sequence,
			});
			this.deliverEvidence(evidence);
			if (continuationHasAuthority?.() === false) {
				return;
			}
		}
	}

	public rejectAlteredReplay(): void {
		this.#session.traceLog.add("recovery.equivocation-fault", {
			streamId: this.#streamId,
		});
	}

	public prepareForce(): void {
		if (this.#forcePrepared) {
			return;
		}
		this.#forcePrepared = true;
		this.#sourceFenced = true;
		this.#session.traceLog.add("force.stream-fenced", {
			streamId: this.#streamId,
		});
		if (this.#remoteAdmitted && this.#terminalWinner === undefined) {
			this.selectSourceTerminal({ type: "terminated" });
		}
		if (!this.#terminalDispositionCommitted && !this.#callerUnsubscribed) {
			const outcome: RpcStreamOutcome = this.#outgoingAdmitted
				? {
						type: "failed",
						code: RpcExceptionCodeEnum.outcomeUnknown,
					}
				: { type: "failed", code: RpcExceptionCodeEnum.unavailable };
			this.#preparedForceSubscriberEffect =
				this.stageSubscriberTerminal(outcome);
		}
	}

	public runForceEffects(): void {
		if (this.#forceEffectsRun) {
			return;
		}
		this.#forceEffectsRun = true;
		if (this.#remoteAdmitted && this.#terminalWinner === undefined) {
			this.selectSourceTerminal({ type: "terminated" });
		}
		if (this.#terminalWinner !== undefined) {
			this.finishSourceTerminal(this.#terminalWinner);
		}
		this.runForceSubscriberEffect();
	}

	private runForceSubscriberEffect(): void {
		if (this.#preparedForceSubscriberEffect !== undefined) {
			const effect = this.#preparedForceSubscriberEffect;
			this.#preparedForceSubscriberEffect = undefined;
			this.deferEffect(effect);
			return;
		}
		if (this.#terminalDispositionCommitted) {
			return;
		}
		if (this.#callerUnsubscribed) {
			this.deferEffect(() => this.releaseLocalResource());
			return;
		}
		const outcome: RpcStreamOutcome = this.#outgoingAdmitted
			? {
					type: "failed",
					code: RpcExceptionCodeEnum.outcomeUnknown,
				}
			: { type: "failed", code: RpcExceptionCodeEnum.unavailable };
		this.projectSubscriberTerminal(outcome);
	}

	private projectPreAdmissionFailure(code: RpcStreamFailure): void {
		this.projectSubscriberTerminal({ type: "failed", code });
	}

	private projectSubscriberTerminal(
		outcome: RpcStreamOutcome,
		sequence?: number,
	): void {
		const effect = this.stageSubscriberTerminal(outcome, sequence);
		if (effect !== undefined) {
			this.deferEffect(effect);
		}
	}

	private stageSubscriberTerminal(
		outcome: RpcStreamOutcome,
		sequence?: number,
	): (() => void) | undefined {
		if (this.#terminalDispositionCommitted) {
			return undefined;
		}
		const projection = this.#subscriberSink.reserveTerminal(outcome);
		this.#session.traceLog.add("projection.terminal.reserved", {
			streamId: this.#streamId,
			sequence,
		});
		this.#terminalDispositionCommitted = true;
		this.#terminalEffectExpected = true;
		this.#session.traceLog.add("projection.terminal.disposition", {
			streamId: this.#streamId,
			sequence,
		});
		return () => {
			try {
				this.commitOutgoingFinished(outcome);
				projection.commit();
			} finally {
				this.releaseLocalResource();
			}
		};
	}

	private projectSemanticRejection(
		code:
			| typeof RpcExceptionCodeEnum.unknownService
			| typeof RpcExceptionCodeEnum.unknownMember,
	): void {
		const observationId = this.#session.nextObservationId();
		const startedAt = this.#session.clock.tick();
		const common = {
			observationId,
			peer: this.#sourceSide.peer,
			direction: RpcEventDirectionEnum.incoming,
		} as const;
		if (code === RpcExceptionCodeEnum.unknownService) {
			this.#sourceSide.eventBus.emit({
				...common,
				type: RpcEventTypeEnum.streamStarted,
			});
			this.#sourceSide.eventBus.emit({
				...common,
				type: RpcEventTypeEnum.streamFinished,
				outcome: RpcStreamStatusEnum.failed,
				code,
				durationMs: this.#session.clock.tick() - startedAt,
				admittedItemCount: 0,
			});
		} else {
			this.#sourceSide.eventBus.emit({
				...common,
				type: RpcEventTypeEnum.streamStarted,
				service: this.#request.service,
			});
			this.#sourceSide.eventBus.emit({
				...common,
				type: RpcEventTypeEnum.streamFinished,
				service: this.#request.service,
				outcome: RpcStreamStatusEnum.failed,
				code,
				durationMs: this.#session.clock.tick() - startedAt,
				admittedItemCount: 0,
			});
		}
		this.projectPreAdmissionFailure(code);
	}

	private selectSourceTerminal(
		winner: SourceTerminalWinner,
	): RetainedTerminalEvidence | undefined {
		if (this.#terminalWinner !== undefined) {
			return undefined;
		}
		this.#terminalWinner = winner;
		this.#sourceFenced = true;
		this.#session.traceLog.add("source.terminal-winner", {
			streamId: this.#streamId,
		});
		const outcome = toSubscriberOutcome(winner);
		const sequence = this.#session.allocateSequence();
		const evidence = Object.freeze({
			kind: "terminal" as const,
			sequence,
			boundary: this.#admittedItemCount,
			outcome,
			bodyFingerprint: JSON.stringify([this.#admittedItemCount, outcome]),
		});
		this.#retainedEvidence.push(evidence);
		this.#session.traceLog.add("source.terminal-evidence", {
			streamId: this.#streamId,
			sequence,
		});
		return evidence;
	}

	private commitSourceTerminal(winner: SourceTerminalWinner): void {
		const evidence = this.selectSourceTerminal(winner);
		if (evidence === undefined) {
			return;
		}
		if (!this.#session.isRecovering() && !this.#session.isForced()) {
			this.projectTerminalEvidence(evidence);
		}
		this.finishSourceTerminal(winner);
	}

	private finishSourceTerminal(winner: SourceTerminalWinner): void {
		if (this.#sourceFinishRequested) {
			return;
		}
		this.#sourceFinishRequested = true;
		const retireSource = () => {
			this.deferEffect(() => {
				this.#session.traceLog.add("source.retirement", {
					streamId: this.#streamId,
				});
				try {
					this.finishIncomingObservation(
						this.#incomingControl?.teardownFailed === true,
					);
				} finally {
					this.releaseSourceResource();
				}
			});
		};
		if (this.#incomingControl !== undefined) {
			this.#incomingControl.finish(toIncomingOutcome(winner), retireSource);
		} else if (this.#remoteAdmitted) {
			retireSource();
		}
	}

	private deliverEvidence(evidence: RetainedStreamEvidence): void {
		if (this.#session.isForced()) {
			return;
		}
		if (evidence.kind === "item") {
			if (evidence.itemOrdinal <= this.#dispositionFrontier) {
				this.#session.metrics.suppressedReplays += 1;
				this.#session.traceLog.add("replay.body-suppressed", {
					streamId: this.#streamId,
					sequence: evidence.sequence,
				});
				return;
			}
			assertEqual(
				evidence.itemOrdinal,
				this.#dispositionFrontier + 1,
				"item disposition must stay contiguous",
			);
			const projection = this.#subscriberSink.reserveItem(evidence.snapshot);
			this.#session.traceLog.add("projection.item.reserved", {
				streamId: this.#streamId,
				sequence: evidence.sequence,
			});
			const shouldDeliver = this.observationOpen;
			this.#dispositionFrontier = evidence.itemOrdinal;
			if (shouldDeliver) {
				this.#deliveredItemCount += 1;
			}
			this.#session.traceLog.add("projection.item.disposition", {
				streamId: this.#streamId,
				sequence: evidence.sequence,
			});
			this.#session.traceLog.add("receipt.ack-dirty", {
				streamId: this.#streamId,
				sequence: evidence.sequence,
			});
			this.#itemEffectInProgress = true;
			let effect: RpcStreamItemEffect = "closed";
			try {
				effect = projection.commit();
			} finally {
				this.#itemEffectInProgress = false;
				this.flushDeferredEffects();
			}
			if (effect === "rearm" && this.#terminalWinner === undefined) {
				queueMicrotask(() => {
					if (
						!this.#sourceFenced &&
						!this.#session.isRecovering() &&
						!this.#session.isForced()
					) {
						this.#sourceCreditAvailable = true;
						this.#session.traceLog.add("credit.rearmed", {
							streamId: this.#streamId,
						});
					}
				});
			}
			return;
		}
		this.projectTerminalEvidence(evidence);
	}

	private projectTerminalEvidence(evidence: RetainedTerminalEvidence): void {
		if (this.#terminalDispositionCommitted) {
			this.#session.metrics.suppressedReplays += 1;
			return;
		}
		assertEqual(
			evidence.boundary,
			this.#dispositionFrontier,
			"terminal boundary must equal the disposition frontier",
		);
		this.projectSubscriberTerminal(evidence.outcome, evidence.sequence);
	}

	private deferEffect(effect: () => void): void {
		if (this.#deferredEffectOne === undefined) {
			this.#deferredEffectOne = effect;
		} else if (this.#deferredEffectTwo === undefined) {
			this.#deferredEffectTwo = effect;
		} else {
			throw new Error("LogicalStream deferred-effect capacity exceeded.");
		}
		this.flushDeferredEffects();
	}

	private flushDeferredEffects(): void {
		if (this.#itemEffectInProgress || this.#effectRunnerActive) {
			return;
		}
		this.#effectRunnerActive = true;
		let firstFailure: unknown;
		let failed = false;
		try {
			while (this.#deferredEffectOne !== undefined) {
				const effect = this.#deferredEffectOne;
				this.#deferredEffectOne = this.#deferredEffectTwo;
				this.#deferredEffectTwo = undefined;
				try {
					effect();
				} catch (error) {
					if (!failed) {
						failed = true;
						firstFailure = error;
					}
				}
			}
		} finally {
			this.#effectRunnerActive = false;
			this.maybeConverged();
			this.#session.finishForceIfReady();
		}
		if (failed) {
			throw firstFailure;
		}
	}

	private commitOutgoingFinished(outcome: RpcStreamOutcome): void {
		if (this.#outgoingFinished) {
			return;
		}
		this.#outgoingFinished = true;
		const durationMs = this.#session.clock.tick() - this.#outgoingStartedAt;
		const common = {
			type: RpcEventTypeEnum.streamFinished,
			observationId: this.#outgoingObservationId,
			peer: this.#origin.peer,
			direction: RpcEventDirectionEnum.outgoing,
			service: this.#request.service,
			member: this.#request.member,
			durationMs,
			deliveredItemCount: this.#deliveredItemCount,
		} as const;
		const event: RpcStreamFinishedEvent =
			outcome.type === "completed"
				? { ...common, outcome: RpcStreamStatusEnum.completed }
				: outcome.type === "canceled"
					? { ...common, outcome: RpcStreamStatusEnum.canceled }
					: {
							...common,
							outcome: RpcStreamStatusEnum.failed,
							code: outcome.code,
						};
		this.#session.traceLog.add("telemetry.outgoing.finished", {
			streamId: this.#streamId,
			observationId: this.#outgoingObservationId,
		});
		this.#origin.eventBus.emit(event);
	}

	private finishIncomingObservation(teardownFailed: boolean): void {
		if (
			this.#incomingFinished ||
			this.#incomingObservationId === undefined ||
			this.#terminalWinner === undefined
		) {
			return;
		}
		this.#incomingFinished = true;
		const common = {
			type: RpcEventTypeEnum.streamFinished,
			observationId: this.#incomingObservationId,
			peer: this.#sourceSide.peer,
			direction: RpcEventDirectionEnum.incoming,
			service: this.#request.service,
			member: this.#request.member,
			durationMs: this.#session.clock.tick() - this.#incomingStartedAt,
			admittedItemCount: this.#admittedItemCount,
			...(teardownFailed ? { sourceTeardownFailed: true as const } : {}),
		} as const;
		const winner = this.#terminalWinner;
		const event: RpcStreamFinishedEvent =
			winner.type === "completed"
				? { ...common, outcome: RpcStreamStatusEnum.completed }
				: winner.type === "canceled"
					? { ...common, outcome: RpcStreamStatusEnum.canceled }
					: winner.type === "terminated"
						? { ...common, outcome: RpcStreamStatusEnum.terminated }
						: {
								...common,
								outcome: RpcStreamStatusEnum.failed,
								code: winner.code,
							};
		this.#session.traceLog.add("telemetry.incoming.finished", {
			streamId: this.#streamId,
			observationId: this.#incomingObservationId,
		});
		this.#sourceSide.eventBus.emit(event);
	}

	private releaseLocalResource(): void {
		if (!this.#localResourceHeld) {
			return;
		}
		this.#localResourceHeld = false;
		this.#session.metrics.localResources -= 1;
		this.#session.traceLog.add("resource.local-released", {
			streamId: this.#streamId,
		});
		this.maybeConverged();
	}

	private releaseSourceResource(): void {
		if (!this.#sourceResourceHeld) {
			return;
		}
		this.#sourceResourceHeld = false;
		this.#session.metrics.sourceResources -= 1;
		this.#session.traceLog.add("resource.source-released", {
			streamId: this.#streamId,
		});
		this.maybeConverged();
	}

	private maybeConverged(): void {
		if (
			this.#converged ||
			this.#localResourceHeld ||
			this.#sourceResourceHeld ||
			this.#itemEffectInProgress ||
			this.#effectRunnerActive ||
			this.#deferredEffectOne !== undefined ||
			this.#deferredEffectTwo !== undefined ||
			this.#preparedForceSubscriberEffect !== undefined
		) {
			return;
		}
		this.#converged = true;
		this.#session.streamConverged(this);
	}
}

class PrototypeRpcPeer implements IRpcPeer {
	readonly #session: PrototypeSession;
	readonly #side: SideRuntime;
	readonly #protocolSession: SideProtocolSession;
	readonly #state$: Observable<RpcPeerState>;
	readonly debugStreams: LogicalStream[] = [];

	public constructor(session: PrototypeSession, side: SideRuntime) {
		this.#session = session;
		this.#side = side;
		this.#protocolSession = new SideProtocolSession(session, side);
		this.#state$ = side.state$;
	}

	public get state(): RpcPeerState {
		return this.#side.state;
	}

	public get state$(): Observable<RpcPeerState> {
		return this.#state$;
	}

	public expose<T, Members extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Members>,
		implementation: NoInfer<RemoteServiceImplementation<T, Members>>,
	): Cleanup {
		const data = getRemoteServiceDescriptorData(descriptor);
		const exposure = prepareExposure(data, implementation as object);
		if (this.#side.exposures.has(data.wireName)) {
			throw new TypeError(`wire service ${data.wireName} is already exposed.`);
		}
		this.#side.exposures.set(data.wireName, exposure);
		let active = true;
		return () => {
			if (!active) {
				return;
			}
			active = false;
			if (this.#side.exposures.get(data.wireName) === exposure) {
				this.#side.exposures.delete(data.wireName);
			}
		};
	}

	public resolve<T, Members extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Members>,
	): RemoteService<T, Members> {
		const data = getRemoteServiceDescriptorData(descriptor);
		const facade = Object.create(null) as Record<string, unknown>;
		for (const [member, interaction] of Object.entries(data.members)) {
			if (interaction.kind === "unary") {
				facade[member] = (...args: readonly unknown[]) =>
					this.invokeUnary(data.wireName, member, interaction.cancelable, args);
				continue;
			}
			if (interaction.kind === "stream-method") {
				facade[member] = (...args: readonly unknown[]) =>
					this.createRemoteObservable(data.wireName, member, args);
				continue;
			}
			facade[member] = this.createRemoteObservable(data.wireName, member);
		}
		return Object.freeze(facade) as RemoteService<T, Members>;
	}

	private async invokeUnary(
		service: string,
		member: string,
		cancelable: boolean,
		capturedArgs: readonly unknown[],
	): Promise<RpcApplicationValue> {
		if (!this.#session.canSubscribe(this.#side)) {
			throw new RpcException(RpcExceptionCodeEnum.unavailable);
		}
		let ordinaryArgs = capturedArgs;
		let signal: AbortSignal | undefined;
		if (cancelable) {
			const candidate = capturedArgs.at(-1);
			if (candidate !== undefined && !(candidate instanceof AbortSignal)) {
				throw new TypeError(
					"cancelable unary requires AbortSignal | undefined.",
				);
			}
			signal = candidate;
			ordinaryArgs = capturedArgs.slice(0, -1);
		}
		const snapshot = createArgumentsSnapshot(ordinaryArgs);
		const sourceSide = this.#session.other(this.#side);
		const route = sourceSide.exposures.get(service)?.routes[member];
		if (route?.kind !== "unary") {
			throw new RpcException(RpcExceptionCodeEnum.unknownMember);
		}
		if (signal?.aborted === true) {
			throw new RpcException(RpcExceptionCodeEnum.canceled);
		}
		try {
			const result = await route.invoke(
				route.cancelable ? [...snapshot.value, signal] : snapshot.value,
			);
			return normalizeApplicationValue(result);
		} catch (error) {
			if (error instanceof RpcException) {
				throw error;
			}
			throw new RpcException(RpcExceptionCodeEnum.handlerFailed);
		}
	}

	private createRemoteObservable<Item>(
		service: string,
		member: string,
		capturedArgs?: readonly unknown[],
	): Observable<Item> {
		const requestKind =
			capturedArgs === undefined ? "stream-property" : "stream-method";
		return new Observable<Item>((subscriber) => {
			if (!this.#session.canSubscribe(this.#side)) {
				subscriber.error(new RpcException(RpcExceptionCodeEnum.unavailable));
				return undefined;
			}
			let request: RpcProtocolStreamRequest;
			try {
				this.#session.metrics.argumentInspections += 1;
				request =
					requestKind === "stream-method"
						? {
								service,
								member,
								kind: "stream-method",
								args: createArgumentsSnapshot(capturedArgs ?? []),
							}
						: { service, member, kind: "stream-property" };
			} catch (error) {
				subscriber.error(error);
				return undefined;
			}
			const reservation = this.#protocolSession.reserveStream(request);
			if (reservation === undefined) {
				subscriber.error(new RpcException(RpcExceptionCodeEnum.unavailable));
				return undefined;
			}
			let terminalEffectExpected = false;
			const sink = new FrameworkSubscriberSink(
				subscriber as unknown as Subscriber<RpcApplicationValue>,
				{
					isObservationOpen: () =>
						!terminalEffectExpected && !subscriber.closed,
					onItemEffect: () => {
						this.#session.metrics.observerDeliveries += 1;
						this.#session.traceLog.add("observer.next.effect");
					},
					onTerminalEffect: () => {
						terminalEffectExpected = true;
						this.#session.traceLog.add("observer.terminal.effect");
					},
				},
			);
			let stream: IRpcProtocolStream;
			try {
				stream = reservation.commit(sink);
			} catch {
				reservation.release();
				subscriber.error(new RpcException(RpcExceptionCodeEnum.unavailable));
				return undefined;
			}
			if (stream instanceof LogicalStream) {
				this.debugStreams.push(stream);
			}
			subscriber.add(() => {
				if (!terminalEffectExpected) {
					stream.cancel();
				}
			});
			stream.start();
			return undefined;
		});
	}
}

class PrototypeAcceptor implements IRpcAcceptor {
	readonly #peersSubject: BehaviorSubject<readonly IRpcPeer[]>;
	readonly #exposureCleanups = new Set<Cleanup>();
	readonly #session: PrototypeSession;
	public readonly event$: Observable<RpcEvent>;
	public readonly peers$: Observable<readonly IRpcPeer[]>;

	public constructor(session: PrototypeSession, peers: readonly IRpcPeer[]) {
		this.#session = session;
		this.#peersSubject = new BehaviorSubject(Object.freeze([...peers]));
		this.peers$ = this.#peersSubject.asObservable();
		this.event$ = session.right.eventBus.observable;
	}

	public get peers(): readonly IRpcPeer[] {
		return this.#peersSubject.value;
	}

	public expose<T, Members extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Members>,
		implementation: NoInfer<RemoteServiceImplementation<T, Members>>,
	): Cleanup {
		const cleanups = this.peers.map((peer) =>
			peer.expose(descriptor, implementation),
		);
		let active = true;
		const cleanup = () => {
			if (!active) {
				return;
			}
			active = false;
			for (const dispose of cleanups) {
				dispose();
			}
			this.#exposureCleanups.delete(cleanup);
		};
		this.#exposureCleanups.add(cleanup);
		return cleanup;
	}

	public shutdown(): Promise<void> {
		return this.#session.shutdown();
	}

	public close(): Promise<void> {
		return this.#session.close();
	}
}

type RuntimeQuery = { tag: string };

interface RuntimeMixedService {
	echo(value: { then: string }): { then: string };
	cancelableEcho(value: string, signal: AbortSignal): Promise<string>;
	history(query: RuntimeQuery): Observable<string>;
	readonly messages$: Observable<string>;
	readonly snapshots$: Observable<string>;
}

const runtimeMixedIdentifier = createServiceIdentifier<RuntimeMixedService>(
	"RuntimeMixedService",
);

const runtimeMixedDescriptor = createRemoteServiceDescriptor(
	runtimeMixedIdentifier,
	{
		wireName: "prototype.runtime-mixed.v1",
		members: {
			echo: { kind: "unary" },
			cancelableEcho: { kind: "unary", cancelable: true },
			history: { kind: "stream-method" },
			messages$: { kind: "stream-property" },
			snapshots$: { kind: "stream-property" },
		},
	},
);

type CapturedObservation = Readonly<{
	values: RpcApplicationValue[];
	errors: unknown[];
	completions: number;
}>;

function captureObservation<T>(source: Observable<T>): CapturedObservation {
	const values: RpcApplicationValue[] = [];
	const errors: unknown[] = [];
	let completions = 0;
	source.subscribe({
		complete: () => {
			completions += 1;
		},
		error: (error: unknown) => {
			errors.push(error);
		},
		next: (value: T) => {
			values.push(value as RpcApplicationValue);
		},
	});
	return {
		values,
		errors,
		get completions(): number {
			return completions;
		},
	};
}

function assertRpcException(
	actual: unknown,
	code: RpcExceptionCode,
	message: string,
): void {
	assert(actual instanceof RpcException, `${message}: expected RpcException`);
	assertEqual(actual.code, code, `${message}: wrong safe code`);
}

function streamEvents(side: SideRuntime): readonly RpcStreamStartedEvent[] {
	return side.eventBus.events.filter(
		(event): event is RpcStreamStartedEvent =>
			event.type === RpcEventTypeEnum.streamStarted,
	);
}

function finishedStreamEvents(
	side: SideRuntime,
): readonly RpcStreamFinishedEvent[] {
	return side.eventBus.events.filter(
		(event): event is RpcStreamFinishedEvent =>
			event.type === RpcEventTypeEnum.streamFinished,
	);
}

function assertExactTelemetryPairs(
	side: SideRuntime,
	expectedCount: number,
	message: string,
): void {
	const startedIds = streamEvents(side)
		.map((event) => event.observationId)
		.sort();
	const finishedIds = finishedStreamEvents(side)
		.map((event) => event.observationId)
		.sort();
	assertEqual(startedIds.length, expectedCount, `${message} started count`);
	assertEqual(finishedIds.length, expectedCount, `${message} finished count`);
	assertEqual(
		new Set(startedIds).size,
		expectedCount,
		`${message} started identities are unique`,
	);
	assertEqual(
		new Set(finishedIds).size,
		expectedCount,
		`${message} finished identities are unique`,
	);
	assertArrayEqual(startedIds, finishedIds, `${message} pairs are exact`);
}

function createRuntimeImplementation(options?: {
	readonly history?: (query: RuntimeQuery) => Observable<string>;
	readonly messages$?: Observable<string>;
	readonly snapshots?: () => Observable<string>;
}): RuntimeMixedService {
	return {
		cancelableEcho: async (value) => value,
		echo: (value) => value,
		history:
			options?.history ??
			((query) =>
				new Observable<string>((subscriber) => {
					subscriber.next(query.tag);
					subscriber.complete();
				})),
		messages$: options?.messages$ ?? new Subject<string>(),
		get snapshots$(): Observable<string> {
			return options?.snapshots?.() ?? new Subject<string>();
		},
	};
}

function probeDescriptorRuntime(): void {
	assert(
		Object.isFrozen(runtimeMixedDescriptor),
		"P01 descriptor must be frozen",
	);
	assertEqual(
		Object.getPrototypeOf(runtimeMixedDescriptor),
		null,
		"P01 descriptor must have null prototype",
	);
	assertArrayEqual(
		Object.keys(runtimeMixedDescriptor),
		[],
		"P01 descriptor must remain opaque",
	);

	let outerGetterReads = 0;
	const outerAccessor = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(outerAccessor, "history", {
		enumerable: true,
		get: () => {
			outerGetterReads += 1;
			return { kind: "stream-method" };
		},
	});
	let rejectedOuterAccessor = false;
	try {
		createRemoteServiceDescriptor(runtimeMixedIdentifier, {
			wireName: "prototype.runtime-invalid.outer-accessor",
			members: outerAccessor as never,
		});
	} catch (error) {
		rejectedOuterAccessor = error instanceof TypeError;
	}
	assert(rejectedOuterAccessor, "P01 outer accessor must be rejected");
	assertEqual(
		outerGetterReads,
		0,
		"P01 Descriptor construction must not execute outer getter",
	);

	let innerGetterReads = 0;
	const innerAccessor = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(innerAccessor, "kind", {
		enumerable: true,
		get: () => {
			innerGetterReads += 1;
			return "stream-method";
		},
	});
	let rejectedInnerAccessor = false;
	try {
		createRemoteServiceDescriptor(runtimeMixedIdentifier, {
			wireName: "prototype.runtime-invalid.inner-accessor",
			members: { history: innerAccessor } as never,
		});
	} catch (error) {
		rejectedInnerAccessor = error instanceof TypeError;
	}
	assert(rejectedInnerAccessor, "P01 inner accessor must be rejected");
	assertEqual(
		innerGetterReads,
		0,
		"P01 Descriptor construction must not execute inner getter",
	);

	const nonEnumerableOuter = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(nonEnumerableOuter, "history", {
		enumerable: false,
		value: { kind: "stream-method" },
	});
	let rejectedNonEnumerableOuter = false;
	try {
		createRemoteServiceDescriptor(runtimeMixedIdentifier, {
			wireName: "prototype.runtime-invalid.non-enumerable-outer",
			members: nonEnumerableOuter as never,
		});
	} catch (error) {
		rejectedNonEnumerableOuter = error instanceof TypeError;
	}
	assert(
		rejectedNonEnumerableOuter,
		"P01 non-enumerable outer member must fail",
	);

	const nonEnumerableInner = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(nonEnumerableInner, "kind", {
		enumerable: false,
		value: "stream-method",
	});
	let rejectedNonEnumerableInner = false;
	try {
		createRemoteServiceDescriptor(runtimeMixedIdentifier, {
			wireName: "prototype.runtime-invalid.non-enumerable-inner",
			members: { history: nonEnumerableInner } as never,
		});
	} catch (error) {
		rejectedNonEnumerableInner = error instanceof TypeError;
	}
	assert(rejectedNonEnumerableInner, "P01 non-enumerable inner kind must fail");

	const symbolOuter = {
		history: { kind: "stream-method" },
		[Symbol("outer")]: { kind: "unary" },
	};
	const symbolInner = {
		kind: "stream-method",
		[Symbol("inner")]: true,
	};
	for (const [wireName, members] of [
		["prototype.runtime-invalid.symbol-outer", symbolOuter],
		["prototype.runtime-invalid.symbol-inner", { history: symbolInner }],
	] as const) {
		let rejected = false;
		try {
			createRemoteServiceDescriptor(runtimeMixedIdentifier, {
				wireName,
				members: members as never,
			});
		} catch (error) {
			rejected = error instanceof TypeError;
		}
		assert(rejected, `P01 ${wireName} must reject symbol fields`);
	}
	for (const [wireName, members] of [
		[
			"prototype.runtime-invalid.cancelable-false",
			{ cancelableEcho: { kind: "unary", cancelable: false } },
		],
		[
			"prototype.runtime-invalid.extra-definition-field",
			{ history: { kind: "stream-method", extra: true } },
		],
	] as const) {
		let rejected = false;
		try {
			createRemoteServiceDescriptor(runtimeMixedIdentifier, {
				wireName,
				members: members as never,
			});
		} catch (error) {
			rejected = error instanceof TypeError;
		}
		assert(rejected, `P01 ${wireName} must reject cast escapes`);
	}
}

async function probeFacadeAndColdness(): Promise<void> {
	const session = new PrototypeSession();
	let methodAcquisitions = 0;
	let getterAcquisitions = 0;
	let capturedDataSubscriptions = 0;
	let replacementDataSubscriptions = 0;
	let sourceTeardowns = 0;
	const observedQueries: string[] = [];
	const capturedDataSource = new Observable<string>((subscriber) => {
		capturedDataSubscriptions += 1;
		subscriber.next("captured-data");
		subscriber.complete();
		return () => {
			sourceTeardowns += 1;
		};
	});
	const implementation = createRuntimeImplementation({
		history: (query) => {
			methodAcquisitions += 1;
			observedQueries.push(query.tag);
			return new Observable<string>((subscriber) => {
				subscriber.next(query.tag);
				subscriber.complete();
				return () => {
					sourceTeardowns += 1;
				};
			});
		},
		messages$: capturedDataSource,
		snapshots: () => {
			getterAcquisitions += 1;
			return new Observable<string>((subscriber) => {
				subscriber.next(`snapshot-${getterAcquisitions}`);
				subscriber.complete();
				return () => {
					sourceTeardowns += 1;
				};
			});
		},
	});
	let receiverPreserved = false;
	implementation.echo = function echoWithReceiver(value): { then: string } {
		receiverPreserved = this === implementation;
		return value;
	};
	session.right.peer.expose(runtimeMixedDescriptor, implementation);
	(implementation as { messages$: Observable<string> }).messages$ =
		new Observable<string>(() => {
			replacementDataSubscriptions += 1;
		});

	const remote = session.left.peer.resolve(runtimeMixedDescriptor);
	const { echo, history } = remote;
	const methodOne = history({ tag: "one" });
	const methodTwo = history({ tag: "unused" });
	const stableHistory = remote.history;
	const stableProperty = remote.messages$;
	assert(Object.isFrozen(remote), "P04 facade must be frozen");
	assertEqual(
		Object.getPrototypeOf(remote),
		null,
		"P04 facade must be null-proto",
	);
	assertArrayEqual(
		Object.keys(remote),
		["echo", "cancelableEcho", "history", "messages$", "snapshots$"],
		"P04 facade must contain exactly selected enumerable data members",
	);
	assertEqual(remote.then, undefined, "P04 facade must not be thenable");
	for (const descriptor of Object.values(
		Object.getOwnPropertyDescriptors(remote),
	)) {
		assert("value" in descriptor, "P04 facade members must be data properties");
		assert(descriptor.enumerable, "P04 facade members must be enumerable");
	}
	assertEqual(
		remote.history,
		stableHistory,
		"P04 method closure identity must be stable",
	);
	assertEqual(
		remote.messages$,
		stableProperty,
		"P04 property Observable identity must be stable",
	);
	assert(
		methodOne !== methodTwo,
		"P04 each stream method call returns a new Observable",
	);
	assertEqual(methodAcquisitions, 0, "P05 method call must do no source work");
	assertEqual(
		getterAcquisitions,
		0,
		"P05 property read must do no getter work",
	);
	assertEqual(
		capturedDataSubscriptions,
		0,
		"P05 property read must not subscribe",
	);
	assertEqual(
		session.metrics.localAdmissions,
		0,
		"P05 no subscribe means no admission",
	);
	assertEqual(
		streamEvents(session.left).length,
		0,
		"P08 no subscribe means no pair",
	);

	const resolvedByPromise = await Promise.resolve(remote);
	const resolvedByAwait = await remote;
	const returnedByAsync = await (async () => remote)();
	const propertyByPromise = await Promise.resolve(remote.messages$);
	const propertyByAwait = await remote.messages$;
	assertEqual(resolvedByPromise, remote, "P04 Promise.resolve facade identity");
	assertEqual(resolvedByAwait, remote, "P04 await facade identity");
	assertEqual(returnedByAsync, remote, "P04 async return facade identity");
	assertEqual(
		propertyByPromise,
		remote.messages$,
		"P04 Promise.resolve Observable identity",
	);
	assertEqual(
		propertyByAwait,
		remote.messages$,
		"P04 await Observable identity",
	);
	assertEqual(
		session.metrics.localAdmissions,
		0,
		"P04 assimilation must do no work",
	);

	const ordinaryThenData = {
		// biome-ignore lint/suspicious/noThenProperty: required ordinary Application Value probe.
		then: "ordinary-application-data",
	};
	const unaryValue = await echo(ordinaryThenData);
	assert(
		receiverPreserved,
		"P04 destructured method must preserve exposure receiver",
	);
	assertEqual(
		(unaryValue as { then: string }).then,
		"ordinary-application-data",
		"P04 Application Value then data must remain ordinary data",
	);

	const mutableArgument: RuntimeQuery = { tag: "before" };
	const coldMethod = history(mutableArgument);
	assertEqual(
		methodAcquisitions,
		0,
		"P05 method args are only captured at call",
	);
	const first = captureObservation(coldMethod);
	mutableArgument.tag = "after";
	const second = captureObservation(coldMethod);
	assertArrayEqual(first.values, ["before"], "P05 first subscribe snapshot");
	assertArrayEqual(second.values, ["after"], "P05 second subscribe snapshot");
	assertArrayEqual(
		observedQueries,
		["before", "after"],
		"P05 per-subscribe normalization snapshots stay independent",
	);
	assertEqual(
		methodAcquisitions,
		2,
		"P05 each subscribe reacquires method source",
	);
	assertEqual(first.completions, 1, "P05 first cold stream completes");
	assertEqual(second.completions, 1, "P05 second cold stream completes");
	const [firstStream, secondStream] = session.left.peer.debugStreams;
	assert(
		firstStream !== undefined && secondStream !== undefined,
		"P05 streams exist",
	);
	assert(
		firstStream !== secondStream,
		"P05 subscriptions have independent stream state",
	);
	assert(
		firstStream.identity !== secondStream.identity,
		"P05 subscriptions have independent Stream Identity",
	);
	assert(
		firstStream.outgoingObservationId !== secondStream.outgoingObservationId,
		"P05 subscriptions have independent observation ids",
	);

	const dataObservation = captureObservation(remote.messages$);
	assertArrayEqual(
		dataObservation.values,
		["captured-data"],
		"P05 exposure captures data source",
	);
	assertEqual(
		capturedDataSubscriptions,
		1,
		"P05 captured data source subscribed once",
	);
	assertEqual(
		replacementDataSubscriptions,
		0,
		"P05 later property replacement is ignored",
	);
	const getterOne = captureObservation(remote.snapshots$);
	const getterTwo = captureObservation(remote.snapshots$);
	assertArrayEqual(
		getterOne.values,
		["snapshot-1"],
		"P05 first getter admission",
	);
	assertArrayEqual(
		getterTwo.values,
		["snapshot-2"],
		"P05 second getter admission",
	);
	assertEqual(
		getterAcquisitions,
		2,
		"P05 getter runs exactly once per subscribe",
	);
	assertEqual(
		sourceTeardowns,
		5,
		"P05 each completed source owns one teardown",
	);
}

interface RuntimeQualificationService {
	promiseWrapped(): Observable<string>;
	bareThenable(): Observable<string>;
	hybrid(): Observable<string> & PromiseLike<string>;
}

const runtimeQualificationIdentifier =
	createServiceIdentifier<RuntimeQualificationService>(
		"RuntimeQualificationService",
	);

const runtimeQualificationDescriptor = createRemoteServiceDescriptor(
	runtimeQualificationIdentifier,
	{
		wireName: "prototype.runtime-qualification.v1",
		members: {
			promiseWrapped: { kind: "stream-method" },
			bareThenable: { kind: "stream-method" },
			hybrid: { kind: "stream-method" },
		},
	},
);

function probeRuntimeSourceQualification(): void {
	let promiseThenReads = 0;
	let bareThenCalls = 0;
	let hybridThenCalls = 0;
	let hybridSubscriptions = 0;
	const promiseWrapped = new Proxy(Promise.resolve(new Observable<string>()), {
		get: (target, key) => {
			if (key === "then") {
				promiseThenReads += 1;
			}
			return Reflect.get(target, key, target) as unknown;
		},
	});
	const bareThenable = {
		// biome-ignore lint/suspicious/noThenProperty: deliberate cast-escape attack probe.
		then: () => {
			bareThenCalls += 1;
		},
	};
	const hybrid = new Observable<string>((subscriber) => {
		hybridSubscriptions += 1;
		subscriber.next("hybrid-value");
		subscriber.complete();
	}) as Observable<string> & PromiseLike<string>;
	// biome-ignore lint/suspicious/noThenProperty: deliberate Observable-plus-then attack probe.
	hybrid.then = ((..._args: unknown[]) => {
		hybridThenCalls += 1;
		throw new Error("hybrid then must never be called");
	}) as PromiseLike<string>["then"];

	const session = new PrototypeSession();
	const implementation: RuntimeQualificationService = {
		bareThenable: () => bareThenable as unknown as Observable<string>,
		hybrid: () => hybrid,
		promiseWrapped: () => promiseWrapped as unknown as Observable<string>,
	};
	session.right.peer.expose(runtimeQualificationDescriptor, implementation);
	const remote = session.left.peer.resolve(runtimeQualificationDescriptor);
	const promiseFailure = captureObservation(remote.promiseWrapped());
	const bareFailure = captureObservation(remote.bareThenable());
	const hybridSuccess = captureObservation(remote.hybrid());
	assertRpcException(
		promiseFailure.errors[0],
		RpcExceptionCodeEnum.handlerFailed,
		"P04 Promise<Observable> cast escape",
	);
	assertRpcException(
		bareFailure.errors[0],
		RpcExceptionCodeEnum.handlerFailed,
		"P04 bare thenable cast escape",
	);
	assertArrayEqual(
		hybridSuccess.values,
		["hybrid-value"],
		"P04 isObservable+thenable source is subscribed directly",
	);
	assertEqual(promiseThenReads, 0, "P04 Promise then must not be inspected");
	assertEqual(bareThenCalls, 0, "P04 bare thenable then must not be called");
	assertEqual(
		hybridThenCalls,
		0,
		"P04 hybrid Observable then must not be called",
	);
	assertEqual(
		hybridSubscriptions,
		1,
		"P04 hybrid Observable subscribes exactly once",
	);
	for (const error of [...promiseFailure.errors, ...bareFailure.errors]) {
		assert(
			!String(error).includes("Promise") && !String(error).includes("thenable"),
			"P04 safe errors must not leak raw source shape",
		);
	}

	let runtimeThenRejected = false;
	try {
		createRemoteServiceDescriptor(
			createServiceIdentifier<{
				then(): string;
			}>("RuntimeThenService"),
			{
				wireName: "prototype.runtime-invalid.then",
				members: {
					// biome-ignore lint/suspicious/noThenProperty: required reserved-name rejection probe.
					then: { kind: "unary" },
				} as never,
			},
		);
	} catch (error) {
		runtimeThenRejected = error instanceof TypeError;
	}
	assert(runtimeThenRejected, "P04 runtime must reject exact member then");
}

function probeAdmissionCancellation(): void {
	const preSession = new PrototypeSession();
	let preMethodCalls = 0;
	preSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () => {
				preMethodCalls += 1;
				return new Subject<string>();
			},
		}),
	);
	const preRemote = preSession.left.peer.resolve(runtimeMixedDescriptor);
	preSession.enterRecovery();
	const pendingSubscription = preRemote.history({ tag: "pending" }).subscribe();
	const pendingStream = preSession.left.peer.debugStreams.at(-1);
	assert(
		pendingStream !== undefined,
		"P05 recovering subscribe creates local state",
	);
	assertEqual(
		pendingStream.identity,
		undefined,
		"P05 pre-admission Pending is identity-free",
	);
	assertEqual(
		preSession.metrics.wireStarts,
		0,
		"P05 Pending does no wire work",
	);
	pendingSubscription.unsubscribe();
	pendingSubscription.unsubscribe();
	assertEqual(
		preMethodCalls,
		0,
		"P05 pre-admission cancel is definite non-execution",
	);
	assertEqual(
		preSession.metrics.wireCancels,
		0,
		"P05 pre-admission cancel has no wire cancel",
	);
	assertEqual(
		preSession.metrics.localResources,
		0,
		"P05 pre-admission cancel releases local resource",
	);
	const preFinished = finishedStreamEvents(preSession.left);
	assertEqual(
		preFinished.length,
		1,
		"P08 pre-admission cancel has one finished event",
	);
	assertEqual(
		preFinished[0]?.outcome,
		RpcStreamStatusEnum.canceled,
		"P05 pre-admission winner",
	);

	const postSession = new PrototypeSession();
	const source = new Subject<string>();
	let postTeardowns = 0;
	const postSource = new Observable<string>((subscriber) => {
		const inner = source.subscribe(subscriber);
		return () => {
			postTeardowns += 1;
			inner.unsubscribe();
		};
	});
	postSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({ history: () => postSource }),
	);
	const postRemote = postSession.left.peer.resolve(runtimeMixedDescriptor);
	const admittedSubscription = postRemote
		.history({ tag: "admitted" })
		.subscribe();
	const admittedStream = postSession.left.peer.debugStreams.at(-1);
	assert(
		admittedStream?.identity !== undefined,
		"P05 admitted stream owns identity",
	);
	admittedSubscription.unsubscribe();
	admittedSubscription.unsubscribe();
	assertEqual(
		postSession.metrics.wireCancels,
		1,
		"P06 repeated unsubscribe sends at most one cancel",
	);
	assertEqual(
		postTeardowns,
		1,
		"P05 post-admission cancel tears source down once",
	);
	assertEqual(
		postSession.metrics.localResources,
		0,
		"P05 post-admission local release",
	);
	assertEqual(
		postSession.metrics.sourceResources,
		0,
		"P05 post-admission source release",
	);
	assertEqual(
		finishedStreamEvents(postSession.left)[0]?.outcome,
		RpcStreamStatusEnum.canceled,
		"P05 post-admission caller winner is canceled",
	);
	assertEqual(
		finishedStreamEvents(postSession.right)[0]?.outcome,
		RpcStreamStatusEnum.canceled,
		"P05 post-admission source winner is canceled",
	);
}

async function probeSynchronousRxjsAndReentrancy(): Promise<void> {
	const completeSession = new PrototypeSession();
	const completeOrder: string[] = [];
	let completeTeardowns = 0;
	completeSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					completeOrder.push("source-enter");
					subscriber.next("sync-item");
					subscriber.complete();
					subscriber.error(new Error("late-error"));
					completeOrder.push("source-after-terminal");
					return () => {
						completeTeardowns += 1;
						completeOrder.push("returned-teardown");
					};
				}),
		}),
	);
	completeSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "sync-complete" })
		.subscribe({
			complete: () => completeOrder.push("observer-complete"),
			error: () => completeOrder.push("observer-error"),
			next: () => completeOrder.push("observer-next"),
		});
	assertArrayEqual(
		completeOrder,
		[
			"source-enter",
			"observer-next",
			"observer-complete",
			"source-after-terminal",
			"returned-teardown",
		],
		"P06 synchronous next -> complete -> returned teardown order",
	);
	assertEqual(completeTeardowns, 1, "P06 returned teardown runs exactly once");
	const completeStream = completeSession.left.peer.debugStreams[0];
	assertEqual(
		completeStream?.terminalWinner?.type,
		"completed",
		"P06 terminal first winner",
	);
	assertEqual(
		completeStream?.admittedItemCount,
		1,
		"P06 late source effects are ignored",
	);
	assertBefore(
		completeSession.traceLog,
		"source.terminal-winner",
		"source.teardown-released",
	);

	const errorSession = new PrototypeSession();
	const errorOrder: string[] = [];
	errorSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					errorOrder.push("source-enter");
					subscriber.error(new Error("raw-secret"));
					errorOrder.push("source-after-error");
					return () => errorOrder.push("returned-teardown");
				}),
		}),
	);
	const errorObservation = captureObservation(
		errorSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history({ tag: "sync-error" }),
	);
	assertRpcException(
		errorObservation.errors[0],
		RpcExceptionCodeEnum.handlerFailed,
		"P06 sync source error",
	);
	assert(
		!String(errorObservation.errors[0]).includes("raw-secret"),
		"P06 raw source error must not leak",
	);
	assertArrayEqual(
		errorOrder,
		["source-enter", "source-after-error", "returned-teardown"],
		"P06 synchronous error -> returned teardown order",
	);

	const unsubscribeSession = new PrototypeSession();
	let unsubscribeTeardowns = 0;
	unsubscribeSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					subscriber.next("first");
					subscriber.next("must-be-fenced");
					subscriber.complete();
					return () => {
						unsubscribeTeardowns += 1;
					};
				}),
		}),
	);
	const unsubscribeValues: string[] = [];
	let unsubscribeTerminalEffects = 0;
	let unsubscribeCallbackDepth = 0;
	let unsubscribeMaxCallbackDepth = 0;
	let unsubscribeTailAssertions = 0;
	const unsubscribeCallbackOrder: string[] = [];
	const observer = new Subscriber<string>({
		complete: () => {
			unsubscribeCallbackDepth += 1;
			unsubscribeMaxCallbackDepth = Math.max(
				unsubscribeMaxCallbackDepth,
				unsubscribeCallbackDepth,
			);
			unsubscribeTerminalEffects += 1;
			unsubscribeCallbackOrder.push("terminal-complete");
			unsubscribeCallbackDepth -= 1;
		},
		error: () => {
			unsubscribeCallbackDepth += 1;
			unsubscribeMaxCallbackDepth = Math.max(
				unsubscribeMaxCallbackDepth,
				unsubscribeCallbackDepth,
			);
			unsubscribeTerminalEffects += 1;
			unsubscribeCallbackOrder.push("terminal-error");
			unsubscribeCallbackDepth -= 1;
		},
		next: (value) => {
			unsubscribeCallbackDepth += 1;
			unsubscribeMaxCallbackDepth = Math.max(
				unsubscribeMaxCallbackDepth,
				unsubscribeCallbackDepth,
			);
			unsubscribeCallbackOrder.push("next-enter");
			unsubscribeValues.push(value);
			observer.unsubscribe();
			assertEqual(
				unsubscribeTerminalEffects,
				0,
				"R1 unsubscribe callback tail has no Subscriber terminal effect",
			);
			assertEqual(
				unsubscribeSession.traceLog.count("telemetry.outgoing.finished"),
				0,
				"R1 unsubscribe callback tail has no outgoing finished effect",
			);
			assertEqual(
				unsubscribeSession.traceLog.count("source.retirement"),
				0,
				"R1 unsubscribe callback tail has no Source retirement effect",
			);
			assertEqual(
				unsubscribeSession.traceLog.count("telemetry.incoming.finished"),
				0,
				"R1 unsubscribe callback tail has no incoming finished effect",
			);
			assertEqual(
				unsubscribeSession.metrics.localResources,
				1,
				"R1 unsubscribe callback tail retains its local resource",
			);
			assertEqual(
				unsubscribeSession.metrics.sourceResources,
				1,
				"R1 unsubscribe callback tail retains its Source resource",
			);
			assertEqual(
				unsubscribeSession.activeStreams.size,
				1,
				"R1 unsubscribe callback tail retains its Logical Stream",
			);
			assertEqual(
				unsubscribeSession.metrics.wireCancels,
				1,
				"R1 explicit unsubscribe alone commits one wire cancel",
			);
			unsubscribeSession.traceLog.add("probe.unsubscribe.callback-tail");
			unsubscribeTailAssertions += 1;
			unsubscribeCallbackOrder.push("next-tail");
			unsubscribeCallbackDepth -= 1;
		},
	});
	unsubscribeSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "observer-unsubscribe" })
		.subscribe(observer);
	await flushMicrotasks();
	assertArrayEqual(
		unsubscribeValues,
		["first"],
		"P06 next reentrant unsubscribe suppresses later source effects",
	);
	assertEqual(
		unsubscribeSession.metrics.wireCancels,
		1,
		"P06 reentrant unsubscribe has at most one cancel",
	);
	assertEqual(
		unsubscribeTeardowns,
		1,
		"P06 reentrant unsubscribe tears down once",
	);
	assertEqual(
		unsubscribeSession.traceLog.count("credit.rearmed"),
		0,
		"P06 closed observer never rearms credit",
	);
	assertEqual(
		unsubscribeTerminalEffects,
		0,
		"P06 reentrant unsubscribe receives no terminal effect",
	);
	assertEqual(
		unsubscribeTailAssertions,
		1,
		"R1 explicit unsubscribe executes every callback-tail assertion",
	);
	assertArrayEqual(
		unsubscribeCallbackOrder,
		["next-enter", "next-tail"],
		"R1 explicit unsubscribe has an exact non-reentrant callback order",
	);
	assertEqual(
		unsubscribeMaxCallbackDepth,
		1,
		"R1 explicit unsubscribe preserves callback depth one",
	);
	assertEqual(
		unsubscribeSession.left.peer.debugStreams[0]?.terminalWinner?.type,
		"canceled",
		"P06 unsubscribe wins source terminal",
	);
	assertEqual(
		unsubscribeSession.traceLog.count("cancel.intent"),
		1,
		"R1 explicit unsubscribe alone emits one cancel intent",
	);
	assertBefore(
		unsubscribeSession.traceLog,
		"probe.unsubscribe.callback-tail",
		"telemetry.outgoing.finished",
	);
	assertBefore(
		unsubscribeSession.traceLog,
		"probe.unsubscribe.callback-tail",
		"source.retirement",
	);
	assertEqual(
		unsubscribeSession.metrics.localResources,
		0,
		"R1 explicit unsubscribe releases its local resource after callback",
	);
	assertEqual(
		unsubscribeSession.metrics.sourceResources,
		0,
		"R1 explicit unsubscribe releases its Source resource after callback",
	);
	assertArrayEqual(
		unsubscribeSession.traceLog.entries
			.filter((entry) =>
				[
					"cancel.disposition",
					"cancel.intent",
					"source.terminal-winner",
					"source.terminal-evidence",
					"probe.unsubscribe.callback-tail",
					"telemetry.outgoing.finished",
					"source.teardown-attempt",
					"source.on-released",
					"source.retirement",
					"telemetry.incoming.finished",
				].includes(entry.name),
			)
			.map((entry) => entry.name),
		[
			"cancel.disposition",
			"cancel.intent",
			"source.terminal-winner",
			"source.terminal-evidence",
			"probe.unsubscribe.callback-tail",
			"telemetry.outgoing.finished",
			"source.teardown-attempt",
			"source.on-released",
			"source.retirement",
			"telemetry.incoming.finished",
		],
		"R1 explicit unsubscribe exact callback/cancel/release order",
	);

	const overflowSession = new PrototypeSession();
	let overflowTeardowns = 0;
	overflowSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					subscriber.next("admitted");
					subscriber.next("overflow");
					return () => {
						overflowTeardowns += 1;
					};
				}),
		}),
	);
	const overflowObservation = captureObservation(
		overflowSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history({ tag: "overflow" }),
	);
	assertArrayEqual(
		overflowObservation.values,
		["admitted"],
		"P06 W=1 admitted item",
	);
	assertRpcException(
		overflowObservation.errors[0],
		RpcExceptionCodeEnum.overflow,
		"P06 W=1 overflow",
	);
	assertEqual(overflowTeardowns, 1, "P06 overflow teardown once");
	assertEqual(
		overflowSession.left.peer.debugStreams[0]?.admittedItemCount,
		1,
		"P06 overflow-causing emission is not admitted",
	);
	assertEqual(
		finishedStreamEvents(overflowSession.right)[0]?.admittedItemCount,
		1,
		"P08 overflow incoming count is one",
	);

	for (const terminalKind of ["second-next", "complete", "error"] as const) {
		const nestedTerminalSession = new PrototypeSession();
		const nestedTerminalSource = new Subject<string>();
		let nestedTerminalTeardowns = 0;
		let nestedCallbackDepth = 0;
		let nestedMaxCallbackDepth = 0;
		let nestedTerminalEffects = 0;
		let nestedTailAssertions = 0;
		const nestedCallbackOrder: string[] = [];
		nestedTerminalSession.right.peer.expose(
			runtimeMixedDescriptor,
			createRuntimeImplementation({
				history: () =>
					new Observable<string>((subscriber) => {
						const inner = nestedTerminalSource.subscribe(subscriber);
						return () => {
							nestedTerminalTeardowns += 1;
							inner.unsubscribe();
						};
					}),
			}),
		);
		const nestedValues: string[] = [];
		const nestedErrors: unknown[] = [];
		let nestedCompletions = 0;
		nestedTerminalSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history({ tag: `same-source-${terminalKind}` })
			.subscribe({
				complete: () => {
					nestedCallbackDepth += 1;
					nestedMaxCallbackDepth = Math.max(
						nestedMaxCallbackDepth,
						nestedCallbackDepth,
					);
					nestedTerminalEffects += 1;
					nestedCompletions += 1;
					nestedCallbackOrder.push("terminal-complete");
					nestedCallbackDepth -= 1;
				},
				error: (error: unknown) => {
					nestedCallbackDepth += 1;
					nestedMaxCallbackDepth = Math.max(
						nestedMaxCallbackDepth,
						nestedCallbackDepth,
					);
					nestedTerminalEffects += 1;
					nestedCallbackOrder.push("terminal-error");
					nestedErrors.push(error);
					nestedCallbackDepth -= 1;
				},
				next: (value) => {
					nestedCallbackDepth += 1;
					nestedMaxCallbackDepth = Math.max(
						nestedMaxCallbackDepth,
						nestedCallbackDepth,
					);
					nestedCallbackOrder.push("next-enter");
					nestedValues.push(value);
					if (terminalKind === "second-next") {
						nestedTerminalSource.next("same-source-second-next");
					} else if (terminalKind === "complete") {
						nestedTerminalSource.complete();
					} else {
						nestedTerminalSource.error(new Error("source-secret"));
					}
					assertEqual(
						nestedTerminalEffects,
						0,
						`R1 ${terminalKind} callback tail has no Subscriber terminal effect`,
					);
					assertEqual(
						nestedTerminalSession.traceLog.count("telemetry.outgoing.finished"),
						0,
						`R1 ${terminalKind} callback tail has no outgoing finished effect`,
					);
					assertEqual(
						nestedTerminalSession.traceLog.count("source.retirement"),
						0,
						`R1 ${terminalKind} callback tail has no Source retirement effect`,
					);
					assertEqual(
						nestedTerminalSession.traceLog.count("telemetry.incoming.finished"),
						0,
						`R1 ${terminalKind} callback tail has no incoming finished effect`,
					);
					assertEqual(
						nestedTerminalSession.metrics.localResources,
						1,
						`R1 ${terminalKind} callback tail retains its local resource`,
					);
					assertEqual(
						nestedTerminalSession.metrics.sourceResources,
						1,
						`R1 ${terminalKind} callback tail retains its Source resource`,
					);
					assertEqual(
						nestedTerminalSession.activeStreams.size,
						1,
						`R1 ${terminalKind} callback tail retains its Logical Stream`,
					);
					nestedTerminalSession.traceLog.add("probe.same-source.callback-tail");
					nestedTailAssertions += 1;
					nestedCallbackOrder.push("next-tail");
					nestedCallbackDepth -= 1;
				},
			});
		nestedTerminalSource.next("same-source-first-next");
		assertArrayEqual(
			nestedValues,
			["same-source-first-next"],
			`R1 ${terminalKind} admits only the first same-source item`,
		);
		assertArrayEqual(
			nestedCallbackOrder,
			[
				"next-enter",
				"next-tail",
				terminalKind === "complete" ? "terminal-complete" : "terminal-error",
			],
			`R1 ${terminalKind} terminal effect flushes after the item callback tail`,
		);
		assertEqual(
			nestedMaxCallbackDepth,
			1,
			`R1 ${terminalKind} callback depth is one`,
		);
		assertEqual(
			nestedTailAssertions,
			1,
			`R1 ${terminalKind} executes every callback-tail assertion`,
		);
		const terminalWinner =
			nestedTerminalSession.left.peer.debugStreams[0]?.terminalWinner;
		assert(terminalWinner !== undefined, `R1 ${terminalKind} selects a winner`);
		if (terminalKind === "complete") {
			assertEqual(
				terminalWinner.type,
				"completed",
				"R1 complete independently selects completed",
			);
			assertEqual(nestedCompletions, 1, "R1 complete effect occurs once");
			assertArrayEqual(nestedErrors, [], "R1 complete emits no error");
		} else {
			assertEqual(
				terminalWinner.type,
				"failed",
				`R1 ${terminalKind} independently selects failed`,
			);
			assert(
				terminalWinner.type === "failed",
				`R1 ${terminalKind} failed winner exposes a safe code`,
			);
			const expectedCode =
				terminalKind === "second-next"
					? RpcExceptionCodeEnum.overflow
					: RpcExceptionCodeEnum.handlerFailed;
			assertEqual(
				terminalWinner.code,
				expectedCode,
				`R1 ${terminalKind} selects the exact failure winner`,
			);
			assertRpcException(
				nestedErrors[0],
				expectedCode,
				`R1 ${terminalKind} projects the safe failure`,
			);
			assertEqual(nestedCompletions, 0, `R1 ${terminalKind} cannot complete`);
		}
		assertEqual(
			nestedTerminalSession.metrics.wireCancels,
			0,
			`R1 ${terminalKind} has no cancel authority`,
		);
		assertEqual(
			nestedTerminalSession.traceLog.count("cancel.intent"),
			0,
			`R1 ${terminalKind} emits no cancel intent`,
		);
		assertEqual(
			nestedTerminalSession.traceLog.count("source.terminal-evidence"),
			1,
			`R1 ${terminalKind} retains one terminal evidence slot`,
		);
		assertEqual(
			nestedTerminalTeardowns,
			1,
			`R1 ${terminalKind} tears down once`,
		);
		assertArrayEqual(
			nestedTerminalSession.traceLog.entries
				.filter((entry) =>
					[
						"source.terminal-winner",
						"source.terminal-evidence",
						"projection.terminal.disposition",
						"source.teardown-attempt",
						"source.on-released",
						"probe.same-source.callback-tail",
						"telemetry.outgoing.finished",
						"observer.terminal.effect",
						"source.retirement",
						"telemetry.incoming.finished",
					].includes(entry.name),
				)
				.map((entry) => entry.name),
			[
				"source.terminal-winner",
				"source.terminal-evidence",
				"projection.terminal.disposition",
				"source.teardown-attempt",
				"source.on-released",
				"probe.same-source.callback-tail",
				"telemetry.outgoing.finished",
				"observer.terminal.effect",
				"source.retirement",
				"telemetry.incoming.finished",
			],
			`R1 ${terminalKind} exact callback/terminal/release order`,
		);
		assertEqual(
			finishedStreamEvents(nestedTerminalSession.right)[0]
				?.sourceTeardownFailed,
			undefined,
			`R1 ${terminalKind} successful teardown carries no incident flag`,
		);
		assertEqual(
			nestedTerminalSession.metrics.localResources,
			0,
			`R1 ${terminalKind} releases its local resource after callback`,
		);
		assertEqual(
			nestedTerminalSession.metrics.sourceResources,
			0,
			`R1 ${terminalKind} releases its Source resource after callback`,
		);
		assertEqual(
			nestedTerminalSession.activeStreams.size,
			0,
			`R1 ${terminalKind} fully converges`,
		);
	}

	for (const terminalKind of ["complete", "error"] as const) {
		const teardownSession = new PrototypeSession();
		let teardownAttempts = 0;
		teardownSession.right.peer.expose(
			runtimeMixedDescriptor,
			createRuntimeImplementation({
				history: () =>
					new Observable<string>((subscriber) => {
						if (terminalKind === "complete") {
							subscriber.complete();
						} else {
							subscriber.error(new Error("source-secret"));
						}
						return () => {
							teardownAttempts += 1;
							throw new Error("teardown-secret");
						};
					}),
			}),
		);
		const observation = captureObservation(
			teardownSession.left.peer
				.resolve(runtimeMixedDescriptor)
				.history({ tag: terminalKind }),
		);
		assertEqual(
			teardownAttempts,
			1,
			`P06 ${terminalKind} teardown attempt once`,
		);
		assertEqual(
			teardownSession.metrics.sourceTeardownFailures,
			1,
			`P06 ${terminalKind} records one teardown incident`,
		);
		const incomingFinished = finishedStreamEvents(teardownSession.right);
		assertEqual(
			incomingFinished.length,
			1,
			`P08 ${terminalKind} source pair once`,
		);
		assertEqual(
			incomingFinished[0]?.sourceTeardownFailed,
			true,
			`P06 ${terminalKind} telemetry carries only failure flag`,
		);
		assertEqual(
			incomingFinished[0]?.admittedItemCount,
			0,
			`P06 ${terminalKind} teardown incident does not change item count`,
		);
		assertEqual(
			incomingFinished[0]?.outcome,
			terminalKind === "complete"
				? RpcStreamStatusEnum.completed
				: RpcStreamStatusEnum.failed,
			`P06 ${terminalKind} teardown incident does not change terminal winner`,
		);
		if (terminalKind === "complete") {
			assertEqual(
				observation.completions,
				1,
				"P06 teardown throw cannot replace complete",
			);
			assertEqual(observation.errors.length, 0, "P06 complete keeps no error");
		} else {
			assertRpcException(
				observation.errors[0],
				RpcExceptionCodeEnum.handlerFailed,
				"P06 teardown throw cannot replace handler failure",
			);
		}
		assert(
			!JSON.stringify(incomingFinished[0]).includes("teardown-secret"),
			"P06 teardown raw error must not enter telemetry",
		);
	}

	const teardownCloseSession = new PrototypeSession();
	const teardownCloseSource = new Subject<string>();
	const teardownCloseOrder: string[] = [];
	const teardownCloseLeftEvents: string[] = [];
	const teardownCloseRightEvents: string[] = [];
	let teardownCloseAttempts = 0;
	let teardownCloseCallbackDepth = 0;
	let teardownCloseMaxCallbackDepth = 0;
	teardownCloseSession.left.eventBus.observable.subscribe({
		complete: () => {
			teardownCloseLeftEvents.push("event$-complete");
			teardownCloseOrder.push("left-event$-complete");
		},
		next: (event) => teardownCloseLeftEvents.push(event.type),
	});
	teardownCloseSession.right.eventBus.observable.subscribe({
		complete: () => teardownCloseRightEvents.push("event$-complete"),
		next: (event) => teardownCloseRightEvents.push(event.type),
	});
	teardownCloseSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					const inner = teardownCloseSource.subscribe(subscriber);
					return () => {
						teardownCloseAttempts += 1;
						teardownCloseOrder.push("teardown-enter");
						inner.unsubscribe();
						teardownCloseSession.forceClose("teardown-close-throw");
						teardownCloseOrder.push("teardown-throw");
						throw new Error("teardown-close-secret");
					};
				}),
		}),
	);
	let teardownCloseCompletions = 0;
	const teardownCloseErrors: unknown[] = [];
	teardownCloseSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "teardown-close-throw" })
		.subscribe({
			complete: () => {
				teardownCloseCallbackDepth += 1;
				teardownCloseMaxCallbackDepth = Math.max(
					teardownCloseMaxCallbackDepth,
					teardownCloseCallbackDepth,
				);
				teardownCloseCompletions += 1;
				teardownCloseCallbackDepth -= 1;
			},
			error: (error: unknown) => {
				teardownCloseErrors.push(error);
			},
		});
	teardownCloseSource.complete();
	assertEqual(
		teardownCloseCompletions,
		1,
		"R1 teardown close cannot replace the committed completed winner",
	);
	assertArrayEqual(
		teardownCloseErrors,
		[],
		"R1 teardown close produces no replacement Subscriber error",
	);
	assertEqual(
		teardownCloseMaxCallbackDepth,
		1,
		"R1 teardown close preserves callback depth one",
	);
	assertEqual(teardownCloseAttempts, 1, "R1 teardown close attempts once");
	assertEqual(
		teardownCloseSession.metrics.wireCancels,
		0,
		"R1 teardown close has no cancel authority",
	);
	assertEqual(
		teardownCloseSession.traceLog.count("source.terminal-evidence"),
		1,
		"R1 teardown close retains one terminal evidence record",
	);
	assertEqual(
		finishedStreamEvents(teardownCloseSession.left)[0]?.outcome,
		RpcStreamStatusEnum.completed,
		"R1 outgoing winner remains completed",
	);
	assertEqual(
		finishedStreamEvents(teardownCloseSession.right)[0]?.sourceTeardownFailed,
		true,
		"R1 teardown-close throw is one payload-free incident bit",
	);
	assert(
		!JSON.stringify(
			finishedStreamEvents(teardownCloseSession.right)[0],
		).includes("teardown-close-secret"),
		"R1 teardown-close raw failure does not leak",
	);
	for (const eventOrder of [
		teardownCloseLeftEvents,
		teardownCloseRightEvents,
	]) {
		const finished = eventOrder.indexOf(RpcEventTypeEnum.streamFinished);
		const peerClosed = eventOrder.indexOf(RpcEventTypeEnum.peerClosed);
		const topologyClosed = eventOrder.indexOf(RpcEventTypeEnum.topologyClosed);
		const completed = eventOrder.indexOf("event$-complete");
		assert(finished >= 0, "R1 close trace contains stream-finished");
		assert(finished < peerClosed, "R1 stream-finished precedes peer-closed");
		assert(
			peerClosed < topologyClosed,
			"R1 peer-closed precedes topology-closed",
		);
		assert(
			topologyClosed < completed,
			"R1 topology-closed precedes event$ completion",
		);
	}
	assert(
		teardownCloseOrder.indexOf("teardown-throw") <
			teardownCloseOrder.indexOf("left-event$-complete"),
		"R1 close waits for the teardown throw and release latch",
	);
	assertBefore(
		teardownCloseSession.traceLog,
		"source.terminal-evidence",
		"source.teardown-attempt",
	);
	assertBefore(
		teardownCloseSession.traceLog,
		"source.teardown-attempt",
		"source.on-released",
	);
	assertBefore(
		teardownCloseSession.traceLog,
		"source.on-released",
		"source.retirement",
	);
	assertBefore(
		teardownCloseSession.traceLog,
		"source.retirement",
		"telemetry.incoming.finished",
	);
	assertEqual(
		teardownCloseSession.activeStreams.size,
		0,
		"R1 force waits for logical stream convergence",
	);
	assertEqual(
		teardownCloseSession.metrics.localResources,
		0,
		"R1 force releases the local resource",
	);
	assertEqual(
		teardownCloseSession.metrics.sourceResources,
		0,
		"R1 force releases the source resource",
	);
}

async function probeRecoveryContinuity(): Promise<void> {
	const session = new PrototypeSession();
	const methodSubject = new Subject<string>();
	const propertySubject = new Subject<string>();
	let methodAcquisitions = 0;
	let getterAcquisitions = 0;
	let methodSubscriptions = 0;
	let propertySubscriptions = 0;
	let methodTeardowns = 0;
	let propertyTeardowns = 0;
	const methodSource = new Observable<string>((subscriber) => {
		methodSubscriptions += 1;
		const inner = methodSubject.subscribe(subscriber);
		return () => {
			methodTeardowns += 1;
			inner.unsubscribe();
		};
	});
	const propertySource = new Observable<string>((subscriber) => {
		propertySubscriptions += 1;
		const inner = propertySubject.subscribe(subscriber);
		return () => {
			propertyTeardowns += 1;
			inner.unsubscribe();
		};
	});
	const implementation = createRuntimeImplementation({
		history: () => {
			methodAcquisitions += 1;
			return methodSource;
		},
		snapshots: () => {
			getterAcquisitions += 1;
			return propertySource;
		},
	});
	session.right.peer.expose(runtimeMixedDescriptor, implementation);
	const remote = session.left.peer.resolve(runtimeMixedDescriptor);
	const stableFacade = remote;
	const stableProperty = remote.snapshots$;
	const stableMethodObservable = remote.history({ tag: "recovery" });
	const methodValues: string[] = [];
	const propertyValues: string[] = [];
	const methodErrors: unknown[] = [];
	const propertyErrors: unknown[] = [];
	let methodCompletions = 0;
	let propertyCompletions = 0;
	stableMethodObservable.subscribe({
		complete: () => {
			methodCompletions += 1;
		},
		error: (error: unknown) => methodErrors.push(error),
		next: (value) => methodValues.push(value),
	});
	stableProperty.subscribe({
		complete: () => {
			propertyCompletions += 1;
		},
		error: (error: unknown) => propertyErrors.push(error),
		next: (value) => propertyValues.push(value),
	});
	const methodStream = session.left.peer.debugStreams[0];
	const propertyStream = session.left.peer.debugStreams[1];
	assert(
		methodStream !== undefined && propertyStream !== undefined,
		"P07 both streams admitted",
	);
	const methodIdentity = methodStream.identity;
	const propertyIdentity = propertyStream.identity;
	const methodOutgoingObservation = methodStream.outgoingObservationId;
	const methodIncomingObservation = methodStream.incomingObservationId;
	const propertyOutgoingObservation = propertyStream.outgoingObservationId;
	const propertyIncomingObservation = propertyStream.incomingObservationId;
	methodSubject.next("method-before-recovery");
	propertySubject.next("property-before-recovery");
	await flushMicrotasks();
	assertArrayEqual(
		methodValues,
		["method-before-recovery"],
		"P07 initial method item",
	);
	assertArrayEqual(
		propertyValues,
		["property-before-recovery"],
		"P07 initial property item",
	);

	session.enterRecovery();
	const suppressedBefore = session.metrics.suppressedReplays;
	session.replayExact(methodStream);
	session.replayExact(propertyStream);
	assertEqual(
		session.metrics.suppressedReplays,
		suppressedBefore + 2,
		"P07 lost ACK exact replay suppresses already-disposed items",
	);
	methodSubject.next("method-during-recovery");
	propertySubject.next("property-during-recovery");
	methodSubject.complete();
	propertySubject.complete();
	assertEqual(
		methodTeardowns,
		1,
		"P07 recovery terminal tears method source down immediately",
	);
	assertEqual(
		propertyTeardowns,
		1,
		"P07 recovery terminal tears property source down immediately",
	);
	assertEqual(
		methodCompletions,
		0,
		"P07 method terminal waits for evidence replay",
	);
	assertEqual(
		propertyCompletions,
		0,
		"P07 property terminal waits for evidence replay",
	);
	assertEqual(
		finishedStreamEvents(session.right).length,
		2,
		"P07 Source observations finish during Recovery",
	);
	assertEqual(
		streamEvents(session.right).length,
		2,
		"P08 Recovery keeps one Source started per stream",
	);

	session.recover();
	assertArrayEqual(
		methodValues,
		["method-before-recovery", "method-during-recovery"],
		"P07 method replay is deliver-once",
	);
	assertArrayEqual(
		propertyValues,
		["property-before-recovery", "property-during-recovery"],
		"P07 property replay is deliver-once",
	);
	assertEqual(methodCompletions, 1, "P07 method terminal replay once");
	assertEqual(propertyCompletions, 1, "P07 property terminal replay once");
	assertEqual(methodErrors.length, 0, "P07 method recovery has no error");
	assertEqual(propertyErrors.length, 0, "P07 property recovery has no error");
	assertEqual(
		streamEvents(session.left).length,
		2,
		"P08 Recovery keeps one Subscriber started per stream",
	);
	assertEqual(
		finishedStreamEvents(session.left).length,
		2,
		"P08 Recovery keeps one Subscriber pair per stream",
	);
	assertEqual(methodAcquisitions, 1, "P07 method is not reacquired");
	assertEqual(getterAcquisitions, 1, "P07 getter is not reread");
	assertEqual(methodSubscriptions, 1, "P07 method source is not resubscribed");
	assertEqual(
		propertySubscriptions,
		1,
		"P07 property source is not resubscribed",
	);
	assertEqual(methodTeardowns, 1, "P07 method teardown remains one-shot");
	assertEqual(propertyTeardowns, 1, "P07 property teardown remains one-shot");
	assertEqual(
		methodStream.identity,
		methodIdentity,
		"P07 method Stream Identity continuity",
	);
	assertEqual(
		propertyStream.identity,
		propertyIdentity,
		"P07 property Stream Identity continuity",
	);
	assertEqual(
		methodStream.outgoingObservationId,
		methodOutgoingObservation,
		"P07 method outgoing observation continuity",
	);
	assertEqual(
		methodStream.incomingObservationId,
		methodIncomingObservation,
		"P07 method incoming observation continuity",
	);
	assertEqual(
		propertyStream.outgoingObservationId,
		propertyOutgoingObservation,
		"P07 property outgoing observation continuity",
	);
	assertEqual(
		propertyStream.incomingObservationId,
		propertyIncomingObservation,
		"P07 property incoming observation continuity",
	);
	assertEqual(stableFacade, remote, "P07 facade identity continuity");
	assertEqual(
		remote.snapshots$,
		stableProperty,
		"P07 property Observable identity continuity",
	);
	assertEqual(
		stableMethodObservable,
		stableMethodObservable,
		"P07 method Observable identity continuity",
	);

	const completionsBeforeExactReplay = methodCompletions + propertyCompletions;
	session.replayExact(methodStream);
	session.replayExact(propertyStream);
	assertEqual(
		methodCompletions + propertyCompletions,
		completionsBeforeExactReplay,
		"P07 exact terminal replay has no duplicate effect",
	);
	session.replayAltered(methodStream);
	assertEqual(
		session.traceLog.count("recovery.equivocation-fault"),
		1,
		"P07 altered replay is an explicit attack trace",
	);
}

async function probeRecoveryContinuationAuthority(): Promise<void> {
	const session = new PrototypeSession();
	const source = new Subject<string>();
	let sourceTeardowns = 0;
	let leftEventCompletions = 0;
	let rightEventCompletions = 0;
	session.left.eventBus.observable.subscribe({
		complete: () => {
			leftEventCompletions += 1;
		},
	});
	session.right.eventBus.observable.subscribe({
		complete: () => {
			rightEventCompletions += 1;
		},
	});
	session.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					const inner = source.subscribe(subscriber);
					return () => {
						sourceTeardowns += 1;
						inner.unsubscribe();
					};
				}),
		}),
	);
	const remote = session.left.peer.resolve(runtimeMixedDescriptor);
	const activeValues: string[] = [];
	const activeErrors: unknown[] = [];
	const pendingErrors: unknown[] = [];
	let terminationTask: Promise<void> | undefined;
	remote.history({ tag: "recovery-continuation-active" }).subscribe({
		error: (error: unknown) => activeErrors.push(error),
		next: (value) => {
			activeValues.push(value);
			session.traceLog.add("probe.recovery-replay-shutdown");
			terminationTask = session.shutdown();
		},
	});
	session.enterRecovery();
	const generation = session.captureBindingGeneration();
	remote.history({ tag: "recovery-continuation-pending" }).subscribe({
		error: (error: unknown) => pendingErrors.push(error),
	});
	const activeStream = session.left.peer.debugStreams[0];
	const pendingStream = session.left.peer.debugStreams[1];
	assert(
		activeStream !== undefined && pendingStream !== undefined,
		"B1 active and Pending streams are captured",
	);
	assertEqual(
		pendingStream.identity,
		undefined,
		"B1 recovering Pending starts identity-free",
	);
	source.next("retained");
	assertArrayEqual(
		activeValues,
		[],
		"B1 Recovery retains the item before replay",
	);
	const replayCountBefore = session.metrics.replayedBodies;
	session.recover();
	assert(
		terminationTask !== undefined,
		"B1 replay application effect invokes shutdown",
	);
	await terminationTask;
	assertArrayEqual(
		activeValues,
		["retained"],
		"B1 retained item has one application effect before shutdown wins",
	);
	assertRpcException(
		activeErrors[0],
		RpcExceptionCodeEnum.outcomeUnknown,
		"B1 admitted Subscriber receives outcome-unknown",
	);
	assertEqual(activeErrors.length, 1, "B1 admitted terminal effect is unique");
	assertRpcException(
		pendingErrors[0],
		RpcExceptionCodeEnum.unavailable,
		"B1 identity-free Pending receives unavailable",
	);
	assertEqual(pendingErrors.length, 1, "B1 Pending terminal effect is unique");
	assertEqual(
		session.metrics.replayedBodies,
		replayCountBefore + 1,
		"B1 F-appended terminal evidence cannot become a second replay body",
	);
	assertEqual(
		session.traceLog.count("recovery.continuation.invalidated"),
		1,
		"B1 the losing Recovery continuation is permanently invalidated",
	);
	assertEqual(
		session.traceLog.count("recovery.barrier.end"),
		0,
		"B1 an invalidated Recovery continuation cannot commit its barrier",
	);
	assertEqual(
		session.left.eventBus.events.filter(
			(event) => event.type === RpcEventTypeEnum.peerRecovered,
		).length,
		0,
		"B1 the losing continuation emits no left peer-recovered",
	);
	assertEqual(
		session.right.eventBus.events.filter(
			(event) => event.type === RpcEventTypeEnum.peerRecovered,
		).length,
		0,
		"B1 the losing continuation emits no right peer-recovered",
	);
	assertEqual(
		session.metrics.remoteAdmissions,
		1,
		"B1 the losing continuation cannot admit Pending remotely",
	);
	assertEqual(
		session.metrics.streamIdentities,
		1,
		"B1 the losing continuation cannot allocate Pending identity",
	);
	assertEqual(
		pendingStream.identity,
		undefined,
		"B1 invalidated Pending stays identity-free",
	);
	assertEqual(sourceTeardowns, 1, "B1 active Source tears down once");
	assertEqual(leftEventCompletions, 1, "B1 left event$ completes once");
	assertEqual(rightEventCompletions, 1, "B1 right event$ completes once");
	assertEqual(
		session.metrics.localResources,
		0,
		"B1 shutdown releases every local resource",
	);
	assertEqual(
		session.metrics.sourceResources,
		0,
		"B1 shutdown releases every Source resource",
	);
	assertEqual(session.activeStreams.size, 0, "B1 all streams converge");
	assertEqual(session.pendingStreams.size, 0, "B1 Pending state is retired");
	assertEqual(session.left.peer.state.status, "closed", "B1 left stays closed");
	assertEqual(
		session.right.peer.state.status,
		"closed",
		"B1 right stays closed",
	);
	assertBefore(
		session.traceLog,
		"recovery.replay",
		"probe.recovery-replay-shutdown",
	);
	assertBefore(
		session.traceLog,
		"probe.recovery-replay-shutdown",
		"shutdown.G",
	);
	assertBefore(session.traceLog, "shutdown.G", "force.F.batch-fence");
	assertBefore(
		session.traceLog,
		"force.F.batch-fence",
		"recovery.continuation.invalidated",
	);
	const sealedEventCounts = Object.freeze({
		left: session.left.eventBus.events.length,
		right: session.right.eventBus.events.length,
	});
	const sealedAuthorityMetrics = Object.freeze({
		methodAcquisitions: session.metrics.methodAcquisitions,
		remoteAdmissions: session.metrics.remoteAdmissions,
		sourceSubscriptions: session.metrics.sourceSubscriptions,
		streamIdentities: session.metrics.streamIdentities,
		wireStarts: session.metrics.wireStarts,
	});
	session.recover();
	session.settleBootstrap(generation);
	session.settleSend(generation);
	session.dispatchCapturedAdmissions();
	session.dispatchSourceJobs();
	source.next("forbidden-late-replay");
	source.complete();
	await flushMicrotasks();
	assertEqual(
		session.shutdown(),
		terminationTask,
		"B1 late shutdown reuses the settled termination task",
	);
	assertEqual(
		session.metrics.replayedBodies,
		replayCountBefore + 1,
		"B1 late continuations cannot replay again",
	);
	assertEqual(
		session.bindingProgress,
		0,
		"B1 late settlements have no authority",
	);
	assertEqual(
		session.left.eventBus.events.length,
		sealedEventCounts.left,
		"B1 late callbacks cannot revive left events",
	);
	assertEqual(
		session.right.eventBus.events.length,
		sealedEventCounts.right,
		"B1 late callbacks cannot revive right events",
	);
	assertEqual(leftEventCompletions, 1, "B1 left completion stays one-shot");
	assertEqual(rightEventCompletions, 1, "B1 right completion stays one-shot");
	assertEqual(
		JSON.stringify({
			methodAcquisitions: session.metrics.methodAcquisitions,
			remoteAdmissions: session.metrics.remoteAdmissions,
			sourceSubscriptions: session.metrics.sourceSubscriptions,
			streamIdentities: session.metrics.streamIdentities,
			wireStarts: session.metrics.wireStarts,
		}),
		JSON.stringify(sealedAuthorityMetrics),
		"B1 late callbacks cannot regain Admission or Source authority",
	);

	const liveEvidenceSession = new PrototypeSession();
	const liveEvidenceSource = new Subject<string>();
	let liveEvidenceTeardowns = 0;
	liveEvidenceSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					const inner = liveEvidenceSource.subscribe(subscriber);
					return () => {
						liveEvidenceTeardowns += 1;
						inner.unsubscribe();
					};
				}),
		}),
	);
	const liveEvidenceValues: string[] = [];
	const liveEvidenceErrors: unknown[] = [];
	liveEvidenceSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "recovery-live-evidence" })
		.subscribe({
			error: (error: unknown) => liveEvidenceErrors.push(error),
			next: (value) => {
				liveEvidenceValues.push(value);
				liveEvidenceSource.next("overflow-during-replay");
			},
		});
	liveEvidenceSession.enterRecovery();
	liveEvidenceSource.next("retained-first");
	liveEvidenceSession.recover();
	assertArrayEqual(
		liveEvidenceValues,
		["retained-first"],
		"B1 authoritative replay delivers its first retained item once",
	);
	assertRpcException(
		liveEvidenceErrors[0],
		RpcExceptionCodeEnum.overflow,
		"B1 authoritative callback-added terminal is replayed",
	);
	assertEqual(
		liveEvidenceErrors.length,
		1,
		"B1 callback-added terminal has one Subscriber effect",
	);
	assertEqual(
		liveEvidenceSession.metrics.replayedBodies,
		2,
		"B1 the live queue replays one item and its callback-added terminal",
	);
	assertEqual(
		liveEvidenceSession.left.peer.debugStreams[0]?.terminalWinner?.type,
		"failed",
		"B1 callback-added overflow remains the Source winner",
	);
	assertEqual(
		liveEvidenceTeardowns,
		1,
		"B1 callback-added terminal tears down once",
	);
	assertEqual(
		liveEvidenceSession.metrics.localResources,
		0,
		"B1 live-evidence replay releases its local resource",
	);
	assertEqual(
		liveEvidenceSession.metrics.sourceResources,
		0,
		"B1 live-evidence replay releases its Source resource",
	);
	assertEqual(
		liveEvidenceSession.activeStreams.size,
		0,
		"B1 live-evidence replay fully converges",
	);

	const entrySession = new PrototypeSession();
	let entryShutdownTask: Promise<void> | undefined;
	let entryLeftEventCompletions = 0;
	let entryRightEventCompletions = 0;
	entrySession.left.eventBus.observable.subscribe({
		complete: () => {
			entryLeftEventCompletions += 1;
		},
	});
	entrySession.right.eventBus.observable.subscribe({
		complete: () => {
			entryRightEventCompletions += 1;
		},
	});
	entrySession.left.peer.state$.subscribe((state) => {
		if (state.status === "recovering" && entryShutdownTask === undefined) {
			entryShutdownTask = entrySession.shutdown();
		}
	});
	entrySession.enterRecovery();
	assert(
		entryShutdownTask !== undefined,
		"B1 Recovery entry application effect invokes shutdown",
	);
	await entryShutdownTask;
	assertEqual(
		entrySession.traceLog.count("recovery.entry.invalidated"),
		1,
		"B1 G invalidates an in-flight Recovery entry publication",
	);
	assertEqual(
		entrySession.traceLog.count("recovery.enter"),
		0,
		"B1 invalidated Recovery entry cannot commit",
	);
	assertEqual(
		entrySession.left.peer.state.status,
		"closed",
		"B1 reentrant entry shutdown keeps left closed",
	);
	assertEqual(
		entrySession.right.peer.state.status,
		"closed",
		"B1 reentrant entry shutdown keeps right closed",
	);
	assertEqual(
		entrySession.left.eventBus.events.filter(
			(event) => event.type === RpcEventTypeEnum.peerRecovering,
		).length,
		0,
		"B1 invalidated entry emits no stale left peer-recovering",
	);
	assertEqual(
		entrySession.right.eventBus.events.filter(
			(event) => event.type === RpcEventTypeEnum.peerRecovering,
		).length,
		0,
		"B1 invalidated entry emits no stale right peer-recovering",
	);
	assertEqual(
		entryLeftEventCompletions,
		1,
		"B1 reentrant entry completes left event$ once",
	);
	assertEqual(
		entryRightEventCompletions,
		1,
		"B1 reentrant entry completes right event$ once",
	);
}

async function probeRecoveredPublicationPendingHandoff(): Promise<void> {
	for (const trigger of ["connected-state", "peer-recovered-event"] as const) {
		const session = new PrototypeSession();
		const activeSource = new Subject<string>();
		let activeAcquisitions = 0;
		let activeTeardowns = 0;
		let pendingAcquisitions = 0;
		let leftEventCompletions = 0;
		let rightEventCompletions = 0;
		session.left.eventBus.observable.subscribe({
			complete: () => {
				leftEventCompletions += 1;
			},
		});
		session.right.eventBus.observable.subscribe({
			complete: () => {
				rightEventCompletions += 1;
			},
		});
		session.right.peer.expose(
			runtimeMixedDescriptor,
			createRuntimeImplementation({
				history: (query) => {
					if (query.tag === "active") {
						activeAcquisitions += 1;
						return new Observable<string>((subscriber) => {
							const inner = activeSource.subscribe(subscriber);
							return () => {
								activeTeardowns += 1;
								inner.unsubscribe();
							};
						});
					}
					pendingAcquisitions += 1;
					return new Subject<string>();
				},
			}),
		);
		const remote = session.left.peer.resolve(runtimeMixedDescriptor);
		const activeErrors: unknown[] = [];
		const pendingErrors: unknown[] = [];
		remote.history({ tag: "active" }).subscribe({
			error: (error: unknown) => activeErrors.push(error),
		});
		const activeStream = session.left.peer.debugStreams[0];
		assert(activeStream !== undefined, `B4 ${trigger} active stream admitted`);
		session.enterRecovery();
		const bindingGeneration = session.captureBindingGeneration();
		remote.history({ tag: "pending" }).subscribe({
			error: (error: unknown) => pendingErrors.push(error),
		});
		const pendingStream = session.left.peer.debugStreams[1];
		assert(pendingStream !== undefined, `B4 ${trigger} Pending captured`);
		assertEqual(
			pendingStream.identity,
			undefined,
			`B4 ${trigger} Pending starts identity-free`,
		);
		let triggerEffects = 0;
		let terminationTask: Promise<void> | undefined;
		const triggerTraceName =
			trigger === "connected-state"
				? "probe.recovered-state-shutdown"
				: "probe.peer-recovered-shutdown";
		if (trigger === "connected-state") {
			session.left.peer.state$.subscribe((state) => {
				if (state.status === "connected" && terminationTask === undefined) {
					triggerEffects += 1;
					session.traceLog.add(triggerTraceName);
					terminationTask = session.shutdown();
				}
			});
		} else {
			session.left.eventBus.observable.subscribe((event) => {
				// Trigger shutdown only for the first public recovery event.
				const shouldShutdownOnPeerRecovery =
					event.type === RpcEventTypeEnum.peerRecovered &&
					terminationTask === undefined;
				if (shouldShutdownOnPeerRecovery) {
					triggerEffects += 1;
					session.traceLog.add(triggerTraceName);
					terminationTask = session.shutdown();
				}
			});
		}
		const serializedLeftEventOrder: string[] = [];
		const orderedEventTypes = new Set<string>([
			RpcEventTypeEnum.peerRecovered,
			RpcEventTypeEnum.ownerDraining,
			RpcEventTypeEnum.peerDraining,
			RpcEventTypeEnum.ownerClosing,
			RpcEventTypeEnum.streamFinished,
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.topologyClosed,
		]);
		session.left.eventBus.observable.subscribe({
			complete: () => serializedLeftEventOrder.push("event$-complete"),
			next: (event) => {
				if (orderedEventTypes.has(event.type)) {
					serializedLeftEventOrder.push(event.type);
				}
			},
		});
		session.recover();
		assert(
			terminationTask !== undefined,
			`B4 ${trigger} publication effect invokes shutdown`,
		);
		let terminationSettled = false;
		void terminationTask.then(() => {
			terminationSettled = true;
		});
		await flushMicrotasks();
		assert(terminationSettled, `B4 ${trigger} shared termination task settles`);
		await terminationTask;
		assertEqual(
			session.shutdown(),
			terminationTask,
			`B4 ${trigger} reuses the settled termination task`,
		);
		assertEqual(triggerEffects, 1, `B4 ${trigger} trigger effect is unique`);
		assertRpcException(
			activeErrors[0],
			RpcExceptionCodeEnum.outcomeUnknown,
			`B4 ${trigger} admitted Subscriber has a safe terminal`,
		);
		assertEqual(
			activeErrors.length,
			1,
			`B4 ${trigger} admitted terminal is unique`,
		);
		assertRpcException(
			pendingErrors[0],
			RpcExceptionCodeEnum.unavailable,
			`B4 ${trigger} Pending has a safe terminal`,
		);
		assertEqual(
			pendingErrors.length,
			1,
			`B4 ${trigger} Pending terminal is unique`,
		);
		assertEqual(
			activeStream.terminalWinner?.type,
			"terminated",
			`B4 ${trigger} admitted Source selects terminated`,
		);
		assertEqual(
			pendingStream.terminalWinner,
			undefined,
			`B4 ${trigger} Pending creates no Source winner`,
		);
		assertEqual(
			pendingStream.identity,
			undefined,
			`B4 ${trigger} forced Pending remains identity-free`,
		);
		assertEqual(activeAcquisitions, 1, `B4 ${trigger} active acquired once`);
		assertEqual(activeTeardowns, 1, `B4 ${trigger} active tears down once`);
		assertEqual(
			pendingAcquisitions,
			0,
			`B4 ${trigger} Pending is never acquired`,
		);
		assertEqual(
			session.metrics.localAdmissions,
			2,
			`B4 ${trigger} has exactly two Local Admissions`,
		);
		assertEqual(
			session.metrics.outgoingAdmissions,
			1,
			`B4 ${trigger} admits only the active stream outgoing`,
		);
		assertEqual(
			session.metrics.remoteAdmissions,
			1,
			`B4 ${trigger} admits only the active stream remotely`,
		);
		assertEqual(
			session.metrics.streamIdentities,
			1,
			`B4 ${trigger} allocates only the active Stream Identity`,
		);
		assertEqual(
			session.metrics.wireStarts,
			1,
			`B4 ${trigger} starts only the active wire stream`,
		);
		assertEqual(
			session.metrics.sourceSubscriptions,
			1,
			`B4 ${trigger} subscribes only the active Source`,
		);
		assertEqual(
			session.left.peer.state.status,
			"closed",
			`B4 ${trigger} left closes`,
		);
		assertEqual(
			session.right.peer.state.status,
			"closed",
			`B4 ${trigger} right closes`,
		);
		assertEqual(
			session.activeStreams.size,
			0,
			`B4 ${trigger} active streams converge`,
		);
		assertEqual(
			session.pendingStreams.size,
			0,
			`B4 ${trigger} Pending set converges`,
		);
		assertEqual(
			session.capturedStreams.size,
			0,
			`B4 ${trigger} captured set stays empty`,
		);
		assertEqual(
			session.queuedSourceJobs.size,
			0,
			`B4 ${trigger} Source Job set stays empty`,
		);
		assertEqual(
			session.metrics.localResources,
			0,
			`B4 ${trigger} local resources reach zero`,
		);
		assertEqual(
			session.metrics.sourceResources,
			0,
			`B4 ${trigger} Source resources reach zero`,
		);
		assertEqual(
			leftEventCompletions,
			1,
			`B4 ${trigger} left event$ completes once`,
		);
		assertEqual(
			rightEventCompletions,
			1,
			`B4 ${trigger} right event$ completes once`,
		);
		assertArrayEqual(
			serializedLeftEventOrder,
			[
				...(trigger === "connected-state"
					? [RpcEventTypeEnum.ownerDraining, RpcEventTypeEnum.peerDraining]
					: []),
				RpcEventTypeEnum.ownerClosing,
				RpcEventTypeEnum.streamFinished,
				RpcEventTypeEnum.streamFinished,
				RpcEventTypeEnum.peerClosed,
				RpcEventTypeEnum.topologyClosed,
				"event$-complete",
			],
			`B4 ${trigger} serializes recovered/shutdown/finish/close events`,
		);
		assertExactTelemetryPairs(session.left, 2, `B4 ${trigger} left telemetry`);
		assertExactTelemetryPairs(
			session.right,
			1,
			`B4 ${trigger} right telemetry`,
		);
		const pendingFinished = finishedStreamEvents(session.left).find(
			(event) => event.observationId === pendingStream.outgoingObservationId,
		);
		assert(
			pendingFinished?.outcome === RpcStreamStatusEnum.failed,
			`B4 ${trigger} Pending telemetry records failure`,
		);
		assertEqual(
			pendingFinished.code,
			RpcExceptionCodeEnum.unavailable,
			`B4 ${trigger} Pending telemetry uses unavailable`,
		);
		assertEqual(
			finishedStreamEvents(session.right)[0]?.outcome,
			RpcStreamStatusEnum.terminated,
			`B4 ${trigger} Source telemetry records terminated`,
		);
		assertEqual(
			session.traceLog.count("shutdown.G.recovering-force"),
			1,
			`B4 ${trigger} G treats Pending handoff as recovering`,
		);
		assertEqual(
			session.traceLog.count("force.F.batch-fence"),
			1,
			`B4 ${trigger} F runs once`,
		);
		assertEqual(
			session.traceLog.count("recovery.continuation.invalidated"),
			1,
			`B4 ${trigger} stale continuation is invalidated`,
		);
		assertBefore(session.traceLog, "recovery.barrier.end", triggerTraceName);
		assertBefore(session.traceLog, triggerTraceName, "shutdown.G");
		assertBefore(session.traceLog, "shutdown.G", "shutdown.G.recovering-force");
		assertBefore(
			session.traceLog,
			"shutdown.G.recovering-force",
			"force.F.batch-fence",
		);
		assertBefore(
			session.traceLog,
			"force.F.batch-fence",
			"recovery.continuation.invalidated",
		);
		const expectedLeftRecovered = trigger === "peer-recovered-event" ? 1 : 0;
		assertEqual(
			session.left.eventBus.events.filter(
				(event) => event.type === RpcEventTypeEnum.peerRecovered,
			).length,
			expectedLeftRecovered,
			`B4 ${trigger} left recovered publication is bounded`,
		);
		assertEqual(
			session.right.eventBus.events.filter(
				(event) => event.type === RpcEventTypeEnum.peerRecovered,
			).length,
			0,
			`B4 ${trigger} stale continuation cannot publish right recovered`,
		);
		const sealedMetrics = Object.freeze({
			bindingProgress: session.bindingProgress,
			localAdmissions: session.metrics.localAdmissions,
			methodAcquisitions: session.metrics.methodAcquisitions,
			outgoingAdmissions: session.metrics.outgoingAdmissions,
			remoteAdmissions: session.metrics.remoteAdmissions,
			replayedBodies: session.metrics.replayedBodies,
			sourceSubscriptions: session.metrics.sourceSubscriptions,
			streamIdentities: session.metrics.streamIdentities,
			wireStarts: session.metrics.wireStarts,
		});
		const sealedEvents = Object.freeze({
			left: session.left.eventBus.events.length,
			right: session.right.eventBus.events.length,
		});
		session.recover();
		session.settleBootstrap(bindingGeneration);
		session.settleSend(bindingGeneration);
		session.dispatchCapturedAdmissions();
		session.dispatchSourceJobs();
		activeSource.next("forbidden-late-item");
		activeSource.complete();
		const lateObservation = captureObservation(
			remote.history({ tag: "forbidden-late-root" }),
		);
		await flushMicrotasks();
		assertRpcException(
			lateObservation.errors[0],
			RpcExceptionCodeEnum.unavailable,
			`B4 ${trigger} late root is unavailable`,
		);
		assertEqual(
			JSON.stringify({
				bindingProgress: session.bindingProgress,
				localAdmissions: session.metrics.localAdmissions,
				methodAcquisitions: session.metrics.methodAcquisitions,
				outgoingAdmissions: session.metrics.outgoingAdmissions,
				remoteAdmissions: session.metrics.remoteAdmissions,
				replayedBodies: session.metrics.replayedBodies,
				sourceSubscriptions: session.metrics.sourceSubscriptions,
				streamIdentities: session.metrics.streamIdentities,
				wireStarts: session.metrics.wireStarts,
			}),
			JSON.stringify(sealedMetrics),
			`B4 ${trigger} late continuation cannot admit or revive work`,
		);
		assertEqual(
			pendingAcquisitions,
			0,
			`B4 ${trigger} late continuation cannot acquire Pending`,
		);
		assertEqual(
			session.left.eventBus.events.length,
			sealedEvents.left,
			`B4 ${trigger} late continuation cannot revive left events`,
		);
		assertEqual(
			session.right.eventBus.events.length,
			sealedEvents.right,
			`B4 ${trigger} late continuation cannot revive right events`,
		);
		assertEqual(
			activeErrors.length,
			1,
			`B4 ${trigger} late continuation cannot repeat active terminal`,
		);
		assertEqual(
			pendingErrors.length,
			1,
			`B4 ${trigger} late continuation cannot repeat Pending terminal`,
		);
		assertEqual(
			leftEventCompletions,
			1,
			`B4 ${trigger} left completion stays one-shot`,
		);
		assertEqual(
			rightEventCompletions,
			1,
			`B4 ${trigger} right completion stays one-shot`,
		);
	}
}

async function probeNestedTerminationPublicationAuthority(): Promise<void> {
	const session = new PrototypeSession();
	const activeSource = new Subject<string>();
	let activeAcquisitions = 0;
	let activeTeardowns = 0;
	let pendingAcquisitions = 0;
	let leftEventCompletions = 0;
	let rightEventCompletions = 0;
	session.left.eventBus.observable.subscribe({
		complete: () => {
			leftEventCompletions += 1;
		},
	});
	session.right.eventBus.observable.subscribe({
		complete: () => {
			rightEventCompletions += 1;
		},
	});
	session.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: (query) => {
				if (query.tag === "nested-active") {
					activeAcquisitions += 1;
					return new Observable<string>((subscriber) => {
						const inner = activeSource.subscribe(subscriber);
						return () => {
							activeTeardowns += 1;
							inner.unsubscribe();
						};
					});
				}
				pendingAcquisitions += 1;
				return new Subject<string>();
			},
		}),
	);
	const remote = session.left.peer.resolve(runtimeMixedDescriptor);
	const activeObservation = captureObservation(
		remote.history({ tag: "nested-active" }),
	);
	const activeStream = session.left.peer.debugStreams[0];
	assert(activeStream !== undefined, "nested authority admits active stream");
	session.enterRecovery();
	const bindingGeneration = session.captureBindingGeneration();
	const pendingObservation = captureObservation(
		remote.history({ tag: "nested-pending" }),
	);
	const pendingStream = session.left.peer.debugStreams[1];
	assert(pendingStream !== undefined, "nested authority captures Pending");
	assertEqual(
		pendingStream.identity,
		undefined,
		"nested authority Pending starts identity-free",
	);
	const earlyLeftStates: string[] = [];
	const drainingLeftStates: string[] = [];
	const laterLeftStates: string[] = [];
	const rightStates: string[] = [];
	let connectedShutdownEffects = 0;
	let drainingCloseEffects = 0;
	let shutdownTask: Promise<void> | undefined;
	let closeTask: Promise<void> | undefined;
	session.left.peer.state$.subscribe((state) => {
		earlyLeftStates.push(state.status);
		// Let the first recovered publication trigger the graceful winner.
		const shouldShutdownFromConnected =
			state.status === "connected" && shutdownTask === undefined;
		if (shouldShutdownFromConnected) {
			connectedShutdownEffects += 1;
			session.traceLog.add("probe.nested.connected-shutdown");
			shutdownTask = session.shutdown();
		}
	});
	session.left.peer.state$.subscribe((state) => {
		drainingLeftStates.push(state.status);
		// Let the first draining publication reenter through the force winner.
		const shouldCloseFromDraining =
			state.status === "draining" && closeTask === undefined;
		if (shouldCloseFromDraining) {
			drainingCloseEffects += 1;
			session.traceLog.add("probe.nested.draining-close");
			closeTask = session.close("nested-draining-close");
		}
	});
	session.left.peer.state$.subscribe((state) => {
		laterLeftStates.push(state.status);
	});
	session.right.peer.state$.subscribe((state) => {
		rightStates.push(state.status);
	});
	session.recover();
	assert(shutdownTask !== undefined, "nested connected callback invokes G");
	assert(closeTask !== undefined, "nested draining callback invokes F");
	assertEqual(closeTask, shutdownTask, "nested G/F share one termination task");
	let terminationSettled = false;
	void shutdownTask.then(() => {
		terminationSettled = true;
	});
	await flushMicrotasks();
	assert(terminationSettled, "nested G/F termination task settles");
	await shutdownTask;
	assertEqual(
		session.shutdown(),
		shutdownTask,
		"nested late shutdown reuses the settled task",
	);
	assertEqual(
		session.close(),
		shutdownTask,
		"nested late close reuses the settled task",
	);
	assertEqual(
		connectedShutdownEffects,
		1,
		"nested connected callback commits G once",
	);
	assertEqual(
		drainingCloseEffects,
		1,
		"nested draining callback commits F once",
	);
	assertArrayEqual(
		earlyLeftStates,
		["recovering", "connected", "draining", "closed"],
		"nested early observer sees the authoritative transition sequence",
	);
	assertArrayEqual(
		drainingLeftStates,
		["recovering", "draining", "closed"],
		"nested closing observer receives no superseded connected state",
	);
	assertArrayEqual(
		laterLeftStates,
		["recovering", "closed"],
		"nested later observer receives no superseded connected or draining state",
	);
	assertArrayEqual(
		rightStates,
		["recovering", "closed"],
		"nested right state never regresses after the F winner",
	);
	assertEqual(
		session.left.peer.state.status,
		"closed",
		"nested left state getter remains closed",
	);
	assertEqual(
		session.right.peer.state.status,
		"closed",
		"nested right state getter remains closed",
	);
	assertRpcException(
		activeObservation.errors[0],
		RpcExceptionCodeEnum.outcomeUnknown,
		"nested admitted Subscriber has a safe terminal",
	);
	assertEqual(
		activeObservation.errors.length,
		1,
		"nested admitted Subscriber terminal is unique",
	);
	assertRpcException(
		pendingObservation.errors[0],
		RpcExceptionCodeEnum.unavailable,
		"nested Pending has a safe terminal",
	);
	assertEqual(
		pendingObservation.errors.length,
		1,
		"nested Pending terminal is unique",
	);
	assertEqual(
		activeStream.terminalWinner?.type,
		"terminated",
		"nested active Source selects terminated",
	);
	assertEqual(
		pendingStream.terminalWinner,
		undefined,
		"nested Pending creates no Source winner",
	);
	assertEqual(activeAcquisitions, 1, "nested active Source acquires once");
	assertEqual(activeTeardowns, 1, "nested active Source tears down once");
	assertEqual(pendingAcquisitions, 0, "nested Pending never acquires Source");
	assertEqual(session.activeStreams.size, 0, "nested active set converges");
	assertEqual(session.pendingStreams.size, 0, "nested Pending set converges");
	assertEqual(
		session.capturedStreams.size,
		0,
		"nested captured set stays empty",
	);
	assertEqual(
		session.queuedSourceJobs.size,
		0,
		"nested Source Job set stays empty",
	);
	assertEqual(
		session.metrics.localResources,
		0,
		"nested local resources reach zero",
	);
	assertEqual(
		session.metrics.sourceResources,
		0,
		"nested Source resources reach zero",
	);
	assertEqual(leftEventCompletions, 1, "nested left event$ completes once");
	assertEqual(rightEventCompletions, 1, "nested right event$ completes once");
	assertExactTelemetryPairs(session.left, 2, "nested left telemetry");
	assertExactTelemetryPairs(session.right, 1, "nested right telemetry");
	for (const [sideName, side] of [
		["left", session.left],
		["right", session.right],
	] as const) {
		assertEqual(
			side.eventBus.events.filter(
				(event) => event.type === RpcEventTypeEnum.peerClosed,
			).length,
			1,
			`nested ${sideName} peer-closed is unique`,
		);
		assertEqual(
			side.eventBus.events.filter(
				(event) => event.type === RpcEventTypeEnum.topologyClosed,
			).length,
			1,
			`nested ${sideName} topology-closed is unique`,
		);
	}
	assertEqual(session.traceLog.count("shutdown.G"), 1, "nested G commits once");
	assertEqual(
		session.traceLog.count("force.F.batch-fence"),
		1,
		"nested F commits once",
	);
	assertEqual(
		session.traceLog.count("shutdown.continuation.invalidated"),
		1,
		"nested F invalidates the older G continuation",
	);
	assertEqual(
		session.traceLog.count("shutdown.G.recovering-force"),
		0,
		"nested invalidated G never resumes its Recovery force branch",
	);
	assertEqual(
		session.traceLog.count("recovery.continuation.invalidated"),
		1,
		"nested G invalidates the older Recovery continuation",
	);
	assertBefore(
		session.traceLog,
		"recovery.barrier.end",
		"probe.nested.connected-shutdown",
	);
	assertBefore(
		session.traceLog,
		"probe.nested.connected-shutdown",
		"shutdown.G",
	);
	assertBefore(session.traceLog, "shutdown.G", "probe.nested.draining-close");
	assertBefore(
		session.traceLog,
		"probe.nested.draining-close",
		"force.F.batch-fence",
	);
	assertBefore(
		session.traceLog,
		"force.F.batch-fence",
		"shutdown.continuation.invalidated",
	);
	assertBefore(
		session.traceLog,
		"shutdown.continuation.invalidated",
		"recovery.continuation.invalidated",
	);
	for (const [sideName, side] of [
		["left", session.left],
		["right", session.right],
	] as const) {
		for (const staleType of [
			RpcEventTypeEnum.peerRecovered,
			RpcEventTypeEnum.ownerDraining,
			RpcEventTypeEnum.peerDraining,
		] as const) {
			assertEqual(
				side.eventBus.events.filter((event) => event.type === staleType).length,
				0,
				`nested ${sideName} publishes no stale ${staleType}`,
			);
		}
	}
	const sealedMetrics = Object.freeze({
		bindingProgress: session.bindingProgress,
		localAdmissions: session.metrics.localAdmissions,
		methodAcquisitions: session.metrics.methodAcquisitions,
		outgoingAdmissions: session.metrics.outgoingAdmissions,
		remoteAdmissions: session.metrics.remoteAdmissions,
		replayedBodies: session.metrics.replayedBodies,
		sourceSubscriptions: session.metrics.sourceSubscriptions,
		streamIdentities: session.metrics.streamIdentities,
		wireStarts: session.metrics.wireStarts,
	});
	const sealedEvents = Object.freeze({
		left: session.left.eventBus.events.length,
		right: session.right.eventBus.events.length,
	});
	const sealedStates = Object.freeze({
		earlyLeft: [...earlyLeftStates],
		drainingLeft: [...drainingLeftStates],
		laterLeft: [...laterLeftStates],
		right: [...rightStates],
	});
	session.recover();
	session.settleBootstrap(bindingGeneration);
	session.settleSend(bindingGeneration);
	session.dispatchCapturedAdmissions();
	session.dispatchSourceJobs();
	activeSource.next("forbidden-nested-late-item");
	activeSource.complete();
	const lateObservation = captureObservation(
		remote.history({ tag: "forbidden-nested-late-root" }),
	);
	await flushMicrotasks();
	assertRpcException(
		lateObservation.errors[0],
		RpcExceptionCodeEnum.unavailable,
		"nested late root is unavailable",
	);
	assertEqual(
		JSON.stringify({
			bindingProgress: session.bindingProgress,
			localAdmissions: session.metrics.localAdmissions,
			methodAcquisitions: session.metrics.methodAcquisitions,
			outgoingAdmissions: session.metrics.outgoingAdmissions,
			remoteAdmissions: session.metrics.remoteAdmissions,
			replayedBodies: session.metrics.replayedBodies,
			sourceSubscriptions: session.metrics.sourceSubscriptions,
			streamIdentities: session.metrics.streamIdentities,
			wireStarts: session.metrics.wireStarts,
		}),
		JSON.stringify(sealedMetrics),
		"nested late continuation cannot admit or revive work",
	);
	assertEqual(
		JSON.stringify({
			earlyLeft: earlyLeftStates,
			drainingLeft: drainingLeftStates,
			laterLeft: laterLeftStates,
			right: rightStates,
		}),
		JSON.stringify(sealedStates),
		"nested late continuation cannot revive state publication",
	);
	assertEqual(
		session.left.eventBus.events.length,
		sealedEvents.left,
		"nested late continuation cannot revive left events",
	);
	assertEqual(
		session.right.eventBus.events.length,
		sealedEvents.right,
		"nested late continuation cannot revive right events",
	);
	assertEqual(
		activeObservation.errors.length,
		1,
		"nested late continuation cannot repeat active terminal",
	);
	assertEqual(
		pendingObservation.errors.length,
		1,
		"nested late continuation cannot repeat Pending terminal",
	);
	assertEqual(
		activeAcquisitions,
		1,
		"nested late work cannot reacquire active",
	);
	assertEqual(activeTeardowns, 1, "nested late work cannot repeat teardown");
	assertEqual(
		pendingAcquisitions,
		0,
		"nested late work cannot acquire Pending",
	);
	assertEqual(
		pendingStream.identity,
		undefined,
		"nested late work cannot allocate Pending identity",
	);
	assertArrayEqual(
		activeObservation.values,
		[],
		"nested active observation receives no late value",
	);
	assertEqual(
		activeObservation.completions,
		0,
		"nested active observation receives no completion",
	);
	assertArrayEqual(
		pendingObservation.values,
		[],
		"nested Pending observation receives no value",
	);
	assertEqual(
		pendingObservation.completions,
		0,
		"nested Pending observation receives no completion",
	);
	assertEqual(
		session.activeStreams.size,
		0,
		"nested late active set stays empty",
	);
	assertEqual(
		session.pendingStreams.size,
		0,
		"nested late Pending set stays empty",
	);
	assertEqual(
		session.capturedStreams.size,
		0,
		"nested late captured set stays empty",
	);
	assertEqual(
		session.queuedSourceJobs.size,
		0,
		"nested late Source Job set stays empty",
	);
	assertEqual(
		session.metrics.localResources,
		0,
		"nested late local resources stay zero",
	);
	assertEqual(
		session.metrics.sourceResources,
		0,
		"nested late Source resources stay zero",
	);
	assertEqual(
		leftEventCompletions,
		1,
		"nested left event$ completion stays one-shot",
	);
	assertEqual(
		rightEventCompletions,
		1,
		"nested right event$ completion stays one-shot",
	);
}

async function probeTelemetryAndFifo(): Promise<void> {
	const session = new PrototypeSession();
	const source = new Subject<string>();
	session.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({ history: () => source }),
	);
	const remote = session.left.peer.resolve(runtimeMixedDescriptor);
	const normalObservation = captureObservation(
		remote.history({ tag: "telemetry" }),
	);
	assertEqual(
		streamEvents(session.left).length,
		1,
		"P08 outgoing started once",
	);
	assertEqual(
		streamEvents(session.right).length,
		1,
		"P08 incoming started once",
	);
	assertBefore(
		session.traceLog,
		"telemetry.outgoing.started",
		"outgoing.admission",
	);
	assertBefore(
		session.traceLog,
		"outgoing.admission",
		"telemetry.incoming.started",
	);
	assertBefore(session.traceLog, "telemetry.incoming.started", "source.job");
	source.next("telemetry-item");
	await flushMicrotasks();
	source.complete();
	assertArrayEqual(
		normalObservation.values,
		["telemetry-item"],
		"P08 item delivered",
	);
	assertEqual(normalObservation.completions, 1, "P08 terminal delivered");
	assertEqual(
		finishedStreamEvents(session.left).length,
		1,
		"P08 outgoing finished once",
	);
	assertEqual(
		finishedStreamEvents(session.right).length,
		1,
		"P08 incoming finished once",
	);
	assertEqual(
		finishedStreamEvents(session.left)[0]?.deliveredItemCount,
		1,
		"P08 outgoing count is delivered disposition count",
	);
	assertEqual(
		finishedStreamEvents(session.right)[0]?.admittedItemCount,
		1,
		"P08 incoming count is admitted boundary",
	);
	assertBefore(
		session.traceLog,
		"observer.next.effect",
		"telemetry.outgoing.finished",
	);

	const forbiddenTelemetryKeys = new Set([
		"payload",
		"args",
		"item",
		"result",
		"error",
		"rawError",
		"wireId",
		"sessionId",
		"streamId",
		"sequence",
		"ack",
		"ordinal",
		"memberKind",
	]);
	for (const event of [
		...session.left.eventBus.events,
		...session.right.eventBus.events,
	]) {
		if (
			event.type !== RpcEventTypeEnum.streamStarted &&
			event.type !== RpcEventTypeEnum.streamFinished
		) {
			continue;
		}
		for (const key of Object.keys(event)) {
			assert(!forbiddenTelemetryKeys.has(key), `P08 telemetry forbids ${key}`);
		}
	}
	assert(
		!session.left.eventBus.events.some(
			(event) => String(event.type) === "stream-item",
		),
		"P08 telemetry has no per-item events",
	);

	const localRejectSession = new PrototypeSession();
	localRejectSession.rejectNextLocal = true;
	const localReject = captureObservation(
		localRejectSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history({ tag: "local-reject" }),
	);
	assertRpcException(
		localReject.errors[0],
		RpcExceptionCodeEnum.unavailable,
		"P08 local resource rejection",
	);
	assertEqual(
		streamEvents(localRejectSession.left).length,
		0,
		"P08 pre-local failure has no outgoing pair",
	);
	assertEqual(
		streamEvents(localRejectSession.right).length,
		0,
		"P08 pre-local failure has no incoming pair",
	);

	const badArgumentSession = new PrototypeSession();
	const badArgument = {
		tag: () => "not-an-application-value",
	} as unknown as RuntimeQuery;
	const badArgumentObservation = captureObservation(
		badArgumentSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history(badArgument),
	);
	assert(
		badArgumentObservation.errors[0] instanceof TypeError,
		"P08 bad arg fails preflight",
	);
	assertEqual(
		streamEvents(badArgumentSession.left).length,
		0,
		"P08 bad arg has no outgoing pair",
	);

	interface KnownSourceService {
		readonly known$: Observable<string>;
	}
	interface UnknownCallerService {
		readonly attackerSpelling$: Observable<string>;
	}
	const knownIdentifier =
		createServiceIdentifier<KnownSourceService>("KnownSourceService");
	const unknownIdentifier = createServiceIdentifier<UnknownCallerService>(
		"UnknownCallerService",
	);
	const knownDescriptor = createRemoteServiceDescriptor(knownIdentifier, {
		wireName: "prototype.semantic-rejection.v1",
		members: { known$: { kind: "stream-property" } },
	});
	const unknownDescriptor = createRemoteServiceDescriptor(unknownIdentifier, {
		wireName: "prototype.semantic-rejection.v1",
		members: { attackerSpelling$: { kind: "stream-property" } },
	});
	const semanticSession = new PrototypeSession();
	semanticSession.right.peer.expose(knownDescriptor, {
		known$: new Subject<string>(),
	});
	const semanticObservation = captureObservation(
		semanticSession.left.peer.resolve(unknownDescriptor).attackerSpelling$,
	);
	assertRpcException(
		semanticObservation.errors[0],
		RpcExceptionCodeEnum.unknownMember,
		"P08 semantic unknown member",
	);
	const semanticIncoming = semanticSession.right.eventBus.events.filter(
		(event) =>
			event.type === RpcEventTypeEnum.streamStarted ||
			event.type === RpcEventTypeEnum.streamFinished,
	);
	assertEqual(
		semanticIncoming.length,
		2,
		"P08 semantic rejection creates adjacent pair",
	);
	assertEqual(
		semanticIncoming[0]?.type,
		RpcEventTypeEnum.streamStarted,
		"P08 semantic started first",
	);
	assertEqual(
		semanticIncoming[1]?.type,
		RpcEventTypeEnum.streamFinished,
		"P08 semantic finished second",
	);
	for (const event of semanticIncoming) {
		assertEqual(
			"service" in event ? event.service : undefined,
			"prototype.semantic-rejection.v1",
			"P08 unknown member keeps canonical service",
		);
		assert(
			!("member" in event),
			"P08 unknown member hides attacker spelling and member existence",
		);
	}
	const semanticFinished = semanticIncoming[1];
	assert(
		semanticFinished?.type === RpcEventTypeEnum.streamFinished,
		"P08 semantic finished shape",
	);
	assertEqual(
		semanticFinished.code,
		RpcExceptionCodeEnum.unknownMember,
		"P08 unknown member code",
	);
	assertEqual(
		semanticFinished.admittedItemCount,
		0,
		"P08 semantic rejection count zero",
	);

	const remoteRejectSession = new PrototypeSession();
	remoteRejectSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation(),
	);
	remoteRejectSession.rejectNextIncomingResource = true;
	const resourceObservation = captureObservation(
		remoteRejectSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history({ tag: "remote-resource-reject" }),
	);
	assertRpcException(
		resourceObservation.errors[0],
		RpcExceptionCodeEnum.unavailable,
		"P08 incoming resource rejection",
	);
	assertEqual(
		streamEvents(remoteRejectSession.right).length,
		0,
		"P08 remote resource rejection has no Source pair",
	);
	assertEqual(
		streamEvents(remoteRejectSession.left).length,
		1,
		"P08 remote rejection retains Subscriber pair",
	);
	assertEqual(
		finishedStreamEvents(remoteRejectSession.left).length,
		1,
		"P08 remote rejection finishes Subscriber pair",
	);

	const fifoSession = new PrototypeSession();
	const firstSubscriberEvents: string[] = [];
	const secondSubscriberEvents: string[] = [];
	let secondSubscriberCompleted = 0;
	fifoSession.left.eventBus.observable.subscribe({
		next: (event) => {
			firstSubscriberEvents.push(event.type);
			if (event.type === RpcEventTypeEnum.streamStarted) {
				fifoSession.forceClose("started-callback-close");
			}
		},
	});
	fifoSession.left.eventBus.observable.subscribe({
		complete: () => {
			secondSubscriberCompleted += 1;
			secondSubscriberEvents.push("event$-complete");
		},
		next: (event) => secondSubscriberEvents.push(event.type),
	});
	const fifoObservation = captureObservation(
		fifoSession.left.peer
			.resolve(runtimeMixedDescriptor)
			.history({ tag: "fifo" }),
	);
	assertRpcException(
		fifoObservation.errors[0],
		RpcExceptionCodeEnum.unavailable,
		"P08 started callback force before Outgoing Admission",
	);
	const startedIndex = secondSubscriberEvents.indexOf(
		RpcEventTypeEnum.streamStarted,
	);
	const finishedIndex = secondSubscriberEvents.indexOf(
		RpcEventTypeEnum.streamFinished,
	);
	const peerClosedIndex = secondSubscriberEvents.indexOf(
		RpcEventTypeEnum.peerClosed,
	);
	const topologyClosedIndex = secondSubscriberEvents.indexOf(
		RpcEventTypeEnum.topologyClosed,
	);
	const completedIndex = secondSubscriberEvents.indexOf("event$-complete");
	assert(startedIndex >= 0, "P08 FIFO observer sees started");
	assert(startedIndex < finishedIndex, "P08 FIFO started precedes finished");
	assert(
		finishedIndex < peerClosedIndex,
		"P08 FIFO finished precedes peer-closed",
	);
	assert(
		peerClosedIndex < topologyClosedIndex,
		"P08 FIFO peer-closed precedes topology-closed",
	);
	assert(
		topologyClosedIndex < completedIndex,
		"P08 FIFO topology-closed precedes completion",
	);
	assertEqual(secondSubscriberCompleted, 1, "P08 event$ completes once");
	assertEqual(
		firstSubscriberEvents[0],
		RpcEventTypeEnum.streamStarted,
		"P08 closer saw started",
	);
}

async function probeShutdownCutoffs(): Promise<void> {
	const postGracefulSession = new PrototypeSession();
	let argumentGetterReads = 0;
	let postGracefulMethodCalls = 0;
	let postGracefulSubscriptions = 0;
	postGracefulSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () => {
				postGracefulMethodCalls += 1;
				return new Observable<string>(() => {
					postGracefulSubscriptions += 1;
				});
			},
		}),
	);
	const preGracefulRemote = postGracefulSession.left.peer.resolve(
		runtimeMixedDescriptor,
	);
	const argumentWithGetter = Object.defineProperty({}, "tag", {
		enumerable: true,
		get: () => {
			argumentGetterReads += 1;
			return "must-not-read";
		},
	}) as RuntimeQuery;
	const preGracefulObservable = preGracefulRemote.history(argumentWithGetter);
	const gracefulTask = postGracefulSession.shutdown();
	const postGracefulObservation = captureObservation(preGracefulObservable);
	await gracefulTask;
	assertRpcException(
		postGracefulObservation.errors[0],
		RpcExceptionCodeEnum.unavailable,
		"P09 pre-G Observable subscribed after G",
	);
	assertEqual(
		argumentGetterReads,
		0,
		"P09 G state check precedes argument inspection",
	);
	assertEqual(
		postGracefulSession.metrics.argumentInspections,
		0,
		"P09 G does no normalization",
	);
	assertEqual(
		postGracefulSession.metrics.localAdmissions,
		0,
		"P09 G creates no admission",
	);
	assertEqual(
		postGracefulSession.metrics.streamIdentities,
		0,
		"P09 G creates no identity",
	);
	assertEqual(postGracefulMethodCalls, 0, "P09 G does no source acquisition");
	assertEqual(
		postGracefulSubscriptions,
		0,
		"P09 G does no source subscription",
	);
	assertEqual(
		streamEvents(postGracefulSession.left).length,
		0,
		"P09 G creates no stream pair",
	);

	const capturedSession = new PrototypeSession();
	let capturedMethodCalls = 0;
	capturedSession.deferRemoteAdmission = true;
	capturedSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () => {
				capturedMethodCalls += 1;
				return new Subject<string>();
			},
		}),
	);
	const capturedErrors: unknown[] = [];
	capturedSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "captured-before-remote-admission" })
		.subscribe({ error: (error: unknown) => capturedErrors.push(error) });
	assertEqual(
		capturedSession.metrics.streamIdentities,
		1,
		"P09 captured stream already has identity",
	);
	assertEqual(
		capturedSession.metrics.remoteAdmissions,
		0,
		"P09 captured stream has no Remote Admission",
	);
	const capturedShutdown = capturedSession.shutdown();
	await capturedShutdown;
	assertRpcException(
		capturedErrors[0],
		RpcExceptionCodeEnum.unavailable,
		"P09 G rejects captured pre-Remote-Admission stream",
	);
	assertEqual(
		capturedMethodCalls,
		0,
		"P09 G captured rejection is definite non-execution",
	);
	assertEqual(
		streamEvents(capturedSession.right).length,
		0,
		"P09 G captured rejection has no Source pair",
	);

	const connectedDrainSession = new PrototypeSession();
	connectedDrainSession.deferSourceJobs = true;
	let connectedDrainAcquisitions = 0;
	let connectedDrainSubscriptions = 0;
	let connectedDrainTeardowns = 0;
	connectedDrainSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () => {
				connectedDrainAcquisitions += 1;
				return new Observable<string>((subscriber) => {
					connectedDrainSubscriptions += 1;
					subscriber.next("connected-drain-item");
					subscriber.complete();
					return () => {
						connectedDrainTeardowns += 1;
					};
				});
			},
		}),
	);
	const connectedDrainValues: string[] = [];
	let connectedDrainCompletions = 0;
	connectedDrainSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "connected-G-drain" })
		.subscribe({
			complete: () => {
				connectedDrainCompletions += 1;
			},
			next: (value) => connectedDrainValues.push(value),
		});
	const connectedDrainTask = connectedDrainSession.shutdown();
	assert(
		!connectedDrainSession.isForced(),
		"R2 connected G enters drain without force",
	);
	assertEqual(
		connectedDrainTeardowns,
		0,
		"R2 connected G waits for the admitted Source Start Job",
	);
	connectedDrainSession.dispatchSourceJobs();
	await connectedDrainTask;
	assertArrayEqual(
		connectedDrainValues,
		["connected-drain-item"],
		"R2 connected G permits existing stream progress",
	);
	assertEqual(
		connectedDrainAcquisitions,
		1,
		"R2 connected G dispatches one existing source acquisition",
	);
	assertEqual(
		connectedDrainSubscriptions,
		1,
		"R2 connected G dispatches one existing source subscription",
	);
	assertEqual(
		connectedDrainCompletions,
		1,
		"R2 connected G preserves natural completion",
	);
	assertEqual(
		connectedDrainTeardowns,
		1,
		"R2 connected G releases the source once",
	);
	assertBefore(connectedDrainSession.traceLog, "shutdown.G", "source.job");

	const recoveringGracefulSession = new PrototypeSession();
	const recoveringActiveSource = new Subject<string>();
	let recoveringSourceTeardowns = 0;
	recoveringGracefulSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					const inner = recoveringActiveSource.subscribe(subscriber);
					return () => {
						recoveringSourceTeardowns += 1;
						inner.unsubscribe();
					};
				}),
		}),
	);
	const recoveringRemote = recoveringGracefulSession.left.peer.resolve(
		runtimeMixedDescriptor,
	);
	const recoveringValues: string[][] = [[], [], [], []];
	const recoveringErrors: unknown[][] = [[], [], [], []];
	const recoveringCompletions = [0, 0, 0, 0];
	const subscribeRecoveringProbe = (index: number, tag: string): void => {
		recoveringRemote.history({ tag }).subscribe({
			complete: () => {
				recoveringCompletions[index] = (recoveringCompletions[index] ?? 0) + 1;
			},
			error: (error: unknown) => recoveringErrors[index]?.push(error),
			next: (value) => recoveringValues[index]?.push(value),
		});
	};
	subscribeRecoveringProbe(0, "admitted-active");
	recoveringActiveSource.next("retained-prefix");
	recoveringGracefulSession.deferRemoteAdmission = true;
	subscribeRecoveringProbe(1, "captured-remote-admission");
	recoveringGracefulSession.deferRemoteAdmission = false;
	recoveringGracefulSession.deferSourceJobs = true;
	subscribeRecoveringProbe(2, "admitted-queued-source-job");
	recoveringGracefulSession.enterRecovery();
	const recoveringBindingGeneration =
		recoveringGracefulSession.captureBindingGeneration();
	subscribeRecoveringProbe(3, "identity-free-pending");
	const recoveringStreams = recoveringGracefulSession.left.peer.debugStreams;
	assertEqual(
		recoveringStreams[3]?.identity,
		undefined,
		"R2 recovering Pending is identity-free before G",
	);
	let ownerDrainingAttackRan = false;
	let ownerClosingAttackRan = false;
	recoveringGracefulSession.left.eventBus.observable.subscribe((event) => {
		if (
			event.type === RpcEventTypeEnum.ownerDraining &&
			!ownerDrainingAttackRan
		) {
			ownerDrainingAttackRan = true;
			recoveringGracefulSession.traceLog.add("probe.owner-draining.callback");
			recoveringGracefulSession.dispatchCapturedAdmissions();
			recoveringGracefulSession.dispatchSourceJobs();
			recoveringGracefulSession.settleBootstrap(recoveringBindingGeneration);
			recoveringGracefulSession.settleSend(recoveringBindingGeneration);
			recoveringGracefulSession.recover();
		}
		if (
			event.type === RpcEventTypeEnum.ownerClosing &&
			!ownerClosingAttackRan
		) {
			ownerClosingAttackRan = true;
			recoveringGracefulSession.traceLog.add("probe.owner-closing.callback");
			recoveringActiveSource.next("forbidden-after-F");
			recoveringActiveSource.complete();
		}
	});
	const recoveringShutdownTask = recoveringGracefulSession.shutdown();
	assertEqual(
		recoveringGracefulSession.shutdown(),
		recoveringShutdownTask,
		"R2 recovering G reuses one shutdown task",
	);
	await recoveringShutdownTask;
	const settledMetrics = Object.freeze({
		methodAcquisitions: recoveringGracefulSession.metrics.methodAcquisitions,
		remoteAdmissions: recoveringGracefulSession.metrics.remoteAdmissions,
		sourceSubscriptions: recoveringGracefulSession.metrics.sourceSubscriptions,
		streamIdentities: recoveringGracefulSession.metrics.streamIdentities,
		wireStarts: recoveringGracefulSession.metrics.wireStarts,
	});
	recoveringGracefulSession.recover();
	recoveringGracefulSession.dispatchCapturedAdmissions();
	recoveringGracefulSession.dispatchSourceJobs();
	recoveringGracefulSession.settleBootstrap(recoveringBindingGeneration);
	recoveringGracefulSession.settleSend(recoveringBindingGeneration);
	recoveringActiveSource.next("forbidden-late-item");
	recoveringActiveSource.complete();
	await flushMicrotasks();
	assertArrayEqual(
		recoveringValues,
		[["retained-prefix"], [], [], []],
		"R2 late recovery/binding callbacks cannot create application effects",
	);
	assertArrayEqual(
		recoveringCompletions,
		[0, 0, 0, 0],
		"R2 recovering G never fabricates completion",
	);
	for (const index of [0, 1, 2] as const) {
		assertEqual(
			recoveringErrors[index]?.length,
			1,
			`R2 admitted stream ${index} has one Subscriber terminal`,
		);
		assertRpcException(
			recoveringErrors[index]?.[0],
			RpcExceptionCodeEnum.outcomeUnknown,
			`R2 admitted stream ${index} receives outcome-unknown`,
		);
	}
	assertEqual(
		recoveringErrors[3]?.length,
		1,
		"R2 identity-free Pending has one Subscriber terminal",
	);
	assertRpcException(
		recoveringErrors[3]?.[0],
		RpcExceptionCodeEnum.unavailable,
		"R2 identity-free Pending receives unavailable",
	);
	assertEqual(
		recoveringStreams[0]?.terminalWinner?.type,
		"terminated",
		"R2 active Source without winner becomes terminated",
	);
	assertEqual(
		recoveringStreams[1]?.terminalWinner,
		undefined,
		"R2 captured stream never creates a Source terminal",
	);
	assertEqual(
		recoveringStreams[2]?.terminalWinner?.type,
		"terminated",
		"R2 admitted queued Source selects terminated before effects",
	);
	assertEqual(
		recoveringStreams[3]?.terminalWinner,
		undefined,
		"R2 Pending never creates Source state",
	);
	assertEqual(
		recoveringSourceTeardowns,
		1,
		"R2 active recovering Source tears down exactly once",
	);
	assertEqual(
		recoveringGracefulSession.metrics.methodAcquisitions,
		settledMetrics.methodAcquisitions,
		"R2 late callbacks cannot acquire another source",
	);
	assertEqual(
		recoveringGracefulSession.metrics.sourceSubscriptions,
		settledMetrics.sourceSubscriptions,
		"R2 late callbacks cannot subscribe another source",
	);
	assertEqual(
		recoveringGracefulSession.metrics.remoteAdmissions,
		settledMetrics.remoteAdmissions,
		"R2 late callbacks cannot create Remote Admission",
	);
	assertEqual(
		recoveringGracefulSession.metrics.streamIdentities,
		settledMetrics.streamIdentities,
		"R2 late callbacks cannot create Stream Identity",
	);
	assertEqual(
		recoveringGracefulSession.metrics.wireStarts,
		settledMetrics.wireStarts,
		"R2 late callbacks cannot create wire start",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("recovery.barrier.start"),
		0,
		"R2 recovery gate stays permanently closed",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("recovery.replay"),
		0,
		"R2 late recovery cannot replay retained evidence",
	);
	assertEqual(
		recoveringGracefulSession.bindingProgress,
		0,
		"R2 late bootstrap/send settlements have no binding authority",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count(
			"bootstrap-settlement.authoritative",
		),
		0,
		"R2 no late bootstrap settlement becomes authoritative",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("send-settlement.authoritative"),
		0,
		"R2 no late send settlement becomes authoritative",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count(
			"late.bootstrap-settlement.ignored",
		),
		2,
		"R2 G-window and post-F bootstrap settlements are fenced",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("late.send-settlement.ignored"),
		2,
		"R2 G-window and post-F send settlements are fenced",
	);
	assertEqual(
		recoveringGracefulSession.left.eventBus.events.filter(
			(event) => event.type === RpcEventTypeEnum.peerRecovered,
		).length,
		0,
		"R2 late settlements emit no peer-recovered",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("credit.rearmed"),
		0,
		"R2 forced recovering stream cannot rearm credit",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("late.remote-admission.ignored"),
		2,
		"R2 G-window and post-F Remote Admission callbacks are fenced",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("late.source-job.ignored"),
		2,
		"R2 G-window and post-F Source Job callbacks are fenced",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("late.recover-settlement.ignored"),
		2,
		"R2 G-window and post-F recovery settlements are fenced",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("force.stream-fenced"),
		4,
		"R2 F fences the whole recovering Session before effects",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("source.terminal-evidence"),
		2,
		"R2 F retains terminal evidence for both admitted Sources",
	);
	assertEqual(
		recoveringGracefulSession.traceLog.count("observer.terminal.effect"),
		4,
		"R2 each local observation receives at most one terminal effect",
	);
	assertEqual(
		recoveringGracefulSession.metrics.localResources,
		0,
		"R2 recovering G releases all local resources",
	);
	assertEqual(
		recoveringGracefulSession.metrics.sourceResources,
		0,
		"R2 recovering G releases all source resources",
	);
	assertEqual(
		recoveringGracefulSession.activeStreams.size,
		0,
		"R2 recovering G converges all logical streams",
	);
	assertEqual(
		recoveringGracefulSession.pendingStreams.size,
		0,
		"R2 recovering G retires identity-free Pending state",
	);
	assertBefore(
		recoveringGracefulSession.traceLog,
		"shutdown.G",
		"probe.owner-draining.callback",
	);
	assertBefore(
		recoveringGracefulSession.traceLog,
		"probe.owner-draining.callback",
		"force.F.batch-fence",
	);
	const mutationSteps = recoveringGracefulSession.traceLog.entries
		.filter(
			(entry) =>
				entry.name === "force.stream-fenced" ||
				entry.name === "source.terminal-evidence",
		)
		.map((entry) => entry.step);
	const ownerClosingStep = recoveringGracefulSession.traceLog.first(
		"probe.owner-closing.callback",
	);
	assert(
		mutationSteps.length > 0 && Math.max(...mutationSteps) < ownerClosingStep,
		"R2 all F fence/winner mutations precede ownerClosing callbacks",
	);
	assert(
		ownerClosingStep <
			recoveringGracefulSession.traceLog.first("source.teardown-attempt"),
		"R2 teardown runs only after the complete Session fence",
	);
	assert(
		ownerClosingStep <
			recoveringGracefulSession.traceLog.first("observer.terminal.effect"),
		"R2 Subscriber effects run only after the complete Session fence",
	);
	const recoveringPeerClosed =
		recoveringGracefulSession.left.eventBus.events.find(
			(event) => event.type === RpcEventTypeEnum.peerClosed,
		);
	assert(
		recoveringPeerClosed?.type === RpcEventTypeEnum.peerClosed,
		"R2 recovering G emits peer-closed",
	);
	assertEqual(
		recoveringPeerClosed.reason,
		"graceful-shutdown",
		"R2 recovering force keeps the existing public graceful reason",
	);

	const forceSession = new PrototypeSession();
	const forceSource = new Subject<string>();
	let forceTeardowns = 0;
	forceSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: () =>
				new Observable<string>((subscriber) => {
					const inner = forceSource.subscribe(subscriber);
					return () => {
						forceTeardowns += 1;
						inner.unsubscribe();
					};
				}),
		}),
	);
	const forceErrors: unknown[] = [];
	forceSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "active-before-F" })
		.subscribe({ error: (error: unknown) => forceErrors.push(error) });
	forceSession.forceClose("force-probe");
	assertRpcException(
		forceErrors[0],
		RpcExceptionCodeEnum.outcomeUnknown,
		"P09 admitted Subscriber outcome under F",
	);
	assertEqual(forceTeardowns, 1, "P09 F tears active source down once");
	assertEqual(
		forceSession.metrics.forceEgress,
		0,
		"P09 F fence permits no new egress",
	);
	assertEqual(
		finishedStreamEvents(forceSession.right)[0]?.outcome,
		RpcStreamStatusEnum.terminated,
		"P09 F gives unwon Source terminated",
	);
	assertEqual(
		forceSession.metrics.localResources,
		0,
		"P09 F releases local resource",
	);
	assertEqual(
		forceSession.metrics.sourceResources,
		0,
		"P09 F releases source resource",
	);

	const batchSession = new PrototypeSession();
	const secondSource = new Subject<string>();
	let firstTeardowns = 0;
	let secondTeardowns = 0;
	batchSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({
			history: (query) =>
				query.tag === "A"
					? new Observable<string>(() => () => {
							firstTeardowns += 1;
							secondSource.next("forbidden-reentrant-B-item");
						})
					: new Observable<string>((subscriber) => {
							const inner = secondSource.subscribe(subscriber);
							return () => {
								secondTeardowns += 1;
								inner.unsubscribe();
							};
						}),
		}),
	);
	const batchRemote = batchSession.left.peer.resolve(runtimeMixedDescriptor);
	const firstErrors: unknown[] = [];
	const secondErrors: unknown[] = [];
	const secondValues: string[] = [];
	batchRemote.history({ tag: "A" }).subscribe({
		error: (error: unknown) => firstErrors.push(error),
	});
	batchRemote.history({ tag: "B" }).subscribe({
		error: (error: unknown) => secondErrors.push(error),
		next: (value) => secondValues.push(value),
	});
	batchSession.forceClose("batch-fence-probe");
	assertArrayEqual(
		secondValues,
		[],
		"P09 teardown(A) reentrant B.next is fenced",
	);
	assertEqual(firstTeardowns, 1, "P09 source A teardown once");
	assertEqual(secondTeardowns, 1, "P09 source B teardown once");
	assertRpcException(
		firstErrors[0],
		RpcExceptionCodeEnum.outcomeUnknown,
		"P09 A force outcome",
	);
	assertRpcException(
		secondErrors[0],
		RpcExceptionCodeEnum.outcomeUnknown,
		"P09 B force outcome",
	);
	assertEqual(
		finishedStreamEvents(batchSession.right).reduce(
			(total, event) => total + (event.admittedItemCount ?? 0),
			0,
		),
		0,
		"P09 reentrant B.next creates no Source item effect",
	);

	const reentrantSession = new PrototypeSession();
	const reentrantSource = new Subject<string>();
	const reentrantEventOrder: string[] = [];
	reentrantSession.left.eventBus.observable.subscribe({
		complete: () => reentrantEventOrder.push("event$-complete"),
		next: (event) => reentrantEventOrder.push(event.type),
	});
	reentrantSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({ history: () => reentrantSource }),
	);
	const reentrantValues: string[] = [];
	const reentrantErrors: unknown[] = [];
	let reentrantCallbackDepth = 0;
	let reentrantMaxCallbackDepth = 0;
	let reentrantTerminalEffects = 0;
	let reentrantTailAssertions = 0;
	const reentrantCallbackOrder: string[] = [];
	reentrantSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "next-close" })
		.subscribe({
			complete: () => {
				reentrantCallbackDepth += 1;
				reentrantMaxCallbackDepth = Math.max(
					reentrantMaxCallbackDepth,
					reentrantCallbackDepth,
				);
				reentrantTerminalEffects += 1;
				reentrantCallbackOrder.push("terminal-complete");
				reentrantCallbackDepth -= 1;
			},
			error: (error: unknown) => {
				reentrantCallbackDepth += 1;
				reentrantMaxCallbackDepth = Math.max(
					reentrantMaxCallbackDepth,
					reentrantCallbackDepth,
				);
				reentrantTerminalEffects += 1;
				reentrantCallbackOrder.push("terminal-error");
				reentrantErrors.push(error);
				reentrantCallbackDepth -= 1;
			},
			next: (value) => {
				reentrantCallbackDepth += 1;
				reentrantMaxCallbackDepth = Math.max(
					reentrantMaxCallbackDepth,
					reentrantCallbackDepth,
				);
				reentrantCallbackOrder.push("next-enter");
				reentrantValues.push(value);
				reentrantSession.forceClose("observer-next-close");
				assertEqual(
					reentrantTerminalEffects,
					0,
					"R1 next-close callback tail has no Subscriber terminal effect",
				);
				assertEqual(
					reentrantSession.traceLog.count("telemetry.outgoing.finished"),
					0,
					"R1 next-close callback tail has no outgoing finished effect",
				);
				assertEqual(
					reentrantSession.traceLog.count("source.retirement"),
					0,
					"R1 next-close callback tail has no Source retirement effect",
				);
				assertEqual(
					reentrantSession.traceLog.count("telemetry.incoming.finished"),
					0,
					"R1 next-close callback tail has no incoming finished effect",
				);
				assertEqual(
					reentrantSession.metrics.localResources,
					1,
					"R1 next-close callback tail retains its local resource",
				);
				assertEqual(
					reentrantSession.metrics.sourceResources,
					1,
					"R1 next-close callback tail retains its Source resource",
				);
				assertEqual(
					reentrantSession.activeStreams.size,
					1,
					"R1 next-close callback tail retains its Logical Stream",
				);
				reentrantSession.traceLog.add("probe.next-close.callback-tail");
				reentrantTailAssertions += 1;
				reentrantCallbackOrder.push("next-tail");
				reentrantCallbackDepth -= 1;
			},
		});
	reentrantSource.next("deliver-once-before-close");
	assertArrayEqual(
		reentrantValues,
		["deliver-once-before-close"],
		"P09 reentrant F preserves committed item",
	);
	assertRpcException(
		reentrantErrors[0],
		RpcExceptionCodeEnum.outcomeUnknown,
		"P09 reentrant F terminal",
	);
	assertEqual(
		reentrantTerminalEffects,
		1,
		"R1 next-close has one Subscriber terminal effect",
	);
	assertEqual(
		reentrantTailAssertions,
		1,
		"R1 next-close executes every callback-tail assertion",
	);
	assertArrayEqual(
		reentrantCallbackOrder,
		["next-enter", "next-tail", "terminal-error"],
		"R1 next-close has an exact deferred callback order",
	);
	assertEqual(
		reentrantMaxCallbackDepth,
		1,
		"R1 next-close defers the terminal callback to depth one",
	);
	assertEqual(
		reentrantSession.metrics.wireCancels,
		0,
		"R1 next-close does not invent cancel authority",
	);
	assertEqual(
		reentrantSession.traceLog.count("cancel.intent"),
		0,
		"R1 next-close emits no cancel intent",
	);
	assertEqual(
		reentrantSession.traceLog.count("source.terminal-evidence"),
		1,
		"R1 next-close retains the forced Source terminal evidence",
	);
	assertEqual(
		reentrantSession.metrics.sourceTeardowns,
		1,
		"R1 next-close waits for one Source release latch",
	);
	assertBefore(
		reentrantSession.traceLog,
		"probe.next-close.callback-tail",
		"source.retirement",
	);
	assertBefore(
		reentrantSession.traceLog,
		"probe.next-close.callback-tail",
		"telemetry.outgoing.finished",
	);
	assertEqual(
		reentrantSession.metrics.localResources,
		0,
		"R1 next-close releases its local resource after callback",
	);
	assertEqual(
		reentrantSession.metrics.sourceResources,
		0,
		"R1 next-close releases its Source resource after callback",
	);
	assertEqual(
		reentrantSession.activeStreams.size,
		0,
		"R1 next-close retires its Logical Stream after callback",
	);
	assertArrayEqual(
		reentrantSession.traceLog.entries
			.filter((entry) =>
				[
					"source.terminal-winner",
					"source.terminal-evidence",
					"projection.terminal.disposition",
					"source.teardown-attempt",
					"source.on-released",
					"probe.next-close.callback-tail",
					"source.retirement",
					"telemetry.incoming.finished",
					"telemetry.outgoing.finished",
					"observer.terminal.effect",
				].includes(entry.name),
			)
			.map((entry) => entry.name),
		[
			"source.terminal-winner",
			"source.terminal-evidence",
			"projection.terminal.disposition",
			"source.teardown-attempt",
			"source.on-released",
			"probe.next-close.callback-tail",
			"source.retirement",
			"telemetry.incoming.finished",
			"telemetry.outgoing.finished",
			"observer.terminal.effect",
		],
		"R1 next-close exact callback/terminal/release order",
	);
	const reentrantFinishedIndex = reentrantEventOrder.indexOf(
		RpcEventTypeEnum.streamFinished,
	);
	const reentrantPeerClosedIndex = reentrantEventOrder.indexOf(
		RpcEventTypeEnum.peerClosed,
	);
	const reentrantTopologyClosedIndex = reentrantEventOrder.indexOf(
		RpcEventTypeEnum.topologyClosed,
	);
	const reentrantCompletedIndex =
		reentrantEventOrder.indexOf("event$-complete");
	assert(
		reentrantFinishedIndex < reentrantPeerClosedIndex,
		"P09 stream-finished precedes peer-closed",
	);
	assert(
		reentrantPeerClosedIndex < reentrantTopologyClosedIndex,
		"R1 next-close peer-closed precedes topology-closed",
	);
	assert(
		reentrantTopologyClosedIndex < reentrantCompletedIndex,
		"R1 next-close topology-closed precedes event$ completion",
	);

	const terminalFirstSession = new PrototypeSession();
	const terminalFirstSource = new Subject<string>();
	terminalFirstSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({ history: () => terminalFirstSource }),
	);
	let terminalFirstCompletions = 0;
	terminalFirstSession.left.peer
		.resolve(runtimeMixedDescriptor)
		.history({ tag: "terminal-first" })
		.subscribe({
			complete: () => {
				terminalFirstCompletions += 1;
			},
		});
	terminalFirstSource.complete();
	terminalFirstSession.forceClose("after-terminal");
	assertEqual(
		terminalFirstCompletions,
		1,
		"P09 terminal winner survives later close",
	);
	assertEqual(
		finishedStreamEvents(terminalFirstSession.left)[0]?.outcome,
		RpcStreamStatusEnum.completed,
		"P09 terminal-vs-close preserves completed winner",
	);
}

async function probeUniqueTerminationTask(): Promise<void> {
	for (const [firstMode, secondMode] of [
		["close", "close"],
		["close", "shutdown"],
		["shutdown", "close"],
	] as const) {
		const label = `${firstMode}->${secondMode}`;
		const session = new PrototypeSession();
		const acceptor = new PrototypeAcceptor(session, [session.left.peer]);
		const source = new Subject<string>();
		let sourceTeardowns = 0;
		let leftEventCompletions = 0;
		let rightEventCompletions = 0;
		session.left.eventBus.observable.subscribe({
			complete: () => {
				leftEventCompletions += 1;
			},
		});
		session.right.eventBus.observable.subscribe({
			complete: () => {
				rightEventCompletions += 1;
			},
		});
		session.right.peer.expose(
			runtimeMixedDescriptor,
			createRuntimeImplementation({
				history: () =>
					new Observable<string>((subscriber) => {
						const inner = source.subscribe(subscriber);
						return () => {
							sourceTeardowns += 1;
							inner.unsubscribe();
						};
					}),
			}),
		);
		const remote = session.left.peer.resolve(runtimeMixedDescriptor);
		const observation = captureObservation(
			remote.history({ tag: `termination-task-${label}` }),
		);
		const terminate = (mode: "close" | "shutdown"): Promise<void> =>
			mode === "close" ? acceptor.close() : acceptor.shutdown();
		const firstTask = terminate(firstMode);
		const secondTask = terminate(secondMode);
		assertEqual(
			secondTask,
			firstTask,
			`B2 ${label} returns the same termination task object`,
		);
		let settled = false;
		void firstTask.then(() => {
			settled = true;
		});
		await firstTask;
		assert(settled, `B2 ${label} shared termination task settles`);
		assertEqual(
			acceptor.close(),
			firstTask,
			`B2 ${label} late close reuses the settled task`,
		);
		assertEqual(
			acceptor.shutdown(),
			firstTask,
			`B2 ${label} late shutdown reuses the settled task`,
		);
		assertRpcException(
			observation.errors[0],
			RpcExceptionCodeEnum.outcomeUnknown,
			`B2 ${label} admitted Subscriber has the forced outcome`,
		);
		assertEqual(
			observation.errors.length,
			1,
			`B2 ${label} Subscriber terminal is unique`,
		);
		assertEqual(
			observation.completions,
			0,
			`B2 ${label} does not invent completion`,
		);
		assertArrayEqual(
			observation.values,
			[],
			`B2 ${label} has no application item`,
		);
		assertEqual(sourceTeardowns, 1, `B2 ${label} Source teardown is unique`);
		assertEqual(
			session.traceLog.count("force.F.batch-fence"),
			1,
			`B2 ${label} commits F once`,
		);
		assertEqual(
			session.metrics.wireCancels,
			0,
			`B2 ${label} close modes have no cancel authority`,
		);
		for (const [sideName, side] of [
			["left", session.left],
			["right", session.right],
		] as const) {
			const started = streamEvents(side);
			const finished = finishedStreamEvents(side);
			assertEqual(
				started.length,
				1,
				`B2 ${label} ${sideName} has one stream-started`,
			);
			assertEqual(
				finished.length,
				1,
				`B2 ${label} ${sideName} has one stream-finished`,
			);
			assertEqual(
				finished[0]?.observationId,
				started[0]?.observationId,
				`B2 ${label} ${sideName} telemetry pair has one identity`,
			);
			assertEqual(
				new Set(started.map((event) => event.observationId)).size,
				1,
				`B2 ${label} ${sideName} started identity is unique`,
			);
			assertEqual(
				new Set(finished.map((event) => event.observationId)).size,
				1,
				`B2 ${label} ${sideName} finished identity is unique`,
			);
			assertEqual(
				side.eventBus.events.filter(
					(event) => event.type === RpcEventTypeEnum.peerClosed,
				).length,
				1,
				`B2 ${label} ${sideName} peer-closed is unique`,
			);
			assertEqual(
				side.eventBus.events.filter(
					(event) => event.type === RpcEventTypeEnum.topologyClosed,
				).length,
				1,
				`B2 ${label} ${sideName} topology-closed is unique`,
			);
		}
		assertEqual(
			leftEventCompletions,
			1,
			`B2 ${label} left event$ completes once`,
		);
		assertEqual(
			rightEventCompletions,
			1,
			`B2 ${label} right event$ completes once`,
		);
		assertEqual(
			session.metrics.localResources,
			0,
			`B2 ${label} releases its local resource`,
		);
		assertEqual(
			session.metrics.sourceResources,
			0,
			`B2 ${label} releases its Source resource`,
		);
		assertEqual(session.activeStreams.size, 0, `B2 ${label} retires streams`);
		assertEqual(
			session.pendingStreams.size,
			0,
			`B2 ${label} leaves no Pending state`,
		);
		assertEqual(
			session.left.peer.state.status,
			"closed",
			`B2 ${label} left remains closed`,
		);
		assertEqual(
			session.right.peer.state.status,
			"closed",
			`B2 ${label} right remains closed`,
		);
		const sealedMetrics = Object.freeze({
			localAdmissions: session.metrics.localAdmissions,
			remoteAdmissions: session.metrics.remoteAdmissions,
			streamIdentities: session.metrics.streamIdentities,
			wireStarts: session.metrics.wireStarts,
		});
		const sealedEvents = Object.freeze({
			left: session.left.eventBus.events.length,
			right: session.right.eventBus.events.length,
		});
		source.next("forbidden-late-value");
		source.complete();
		const lateObservation = captureObservation(
			remote.history({ tag: `termination-task-late-${label}` }),
		);
		session.recover();
		await flushMicrotasks();
		assertRpcException(
			lateObservation.errors[0],
			RpcExceptionCodeEnum.unavailable,
			`B2 ${label} rejects a late observation root`,
		);
		assertEqual(
			JSON.stringify({
				localAdmissions: session.metrics.localAdmissions,
				remoteAdmissions: session.metrics.remoteAdmissions,
				streamIdentities: session.metrics.streamIdentities,
				wireStarts: session.metrics.wireStarts,
			}),
			JSON.stringify(sealedMetrics),
			`B2 ${label} late work cannot revive admission or identity`,
		);
		assertEqual(
			session.left.eventBus.events.length,
			sealedEvents.left,
			`B2 ${label} late work cannot revive left events`,
		);
		assertEqual(
			session.right.eventBus.events.length,
			sealedEvents.right,
			`B2 ${label} late work cannot revive right events`,
		);
		assertEqual(
			leftEventCompletions,
			1,
			`B2 ${label} left completion stays one`,
		);
		assertEqual(
			rightEventCompletions,
			1,
			`B2 ${label} right completion stays one`,
		);
	}
}

function probeProtocolProjectionAndRelease(): void {
	const itemValues: RpcApplicationValue[] = [];
	let terminalEffects = 0;
	let observationOpen = true;
	const subscriber = new Subscriber<RpcApplicationValue>({
		complete: () => {
			terminalEffects += 1;
		},
		error: () => {
			terminalEffects += 1;
		},
		next: (value) => itemValues.push(value),
	});
	const sink = new FrameworkSubscriberSink(subscriber, {
		isObservationOpen: () => observationOpen,
		onItemEffect: () => undefined,
		onTerminalEffect: () => {
			observationOpen = false;
		},
	});
	const itemProjection = sink.reserveItem(createSnapshot("two-phase-item"));
	assertArrayEqual(itemValues, [], "P10 reserveItem has no Observer effect");
	assertArrayEqual(
		Object.keys(itemProjection),
		["commit"],
		"P10 item projection exact key",
	);
	assertEqual(
		itemProjection.commit(),
		"rearm",
		"P10 committed item rearms open observation",
	);
	assertArrayEqual(
		itemValues,
		["two-phase-item"],
		"P10 item effect occurs only at commit",
	);
	const terminalProjection = sink.reserveTerminal({ type: "completed" });
	assertEqual(terminalEffects, 0, "P10 reserveTerminal has no Observer effect");
	assertArrayEqual(
		Object.keys(terminalProjection),
		["commit"],
		"P10 terminal projection exact key",
	);
	terminalProjection.commit();
	assertEqual(terminalEffects, 1, "P10 terminal effect occurs only at commit");

	const releaseMetrics = createMetrics();
	const releaseTrace = new TraceLog();
	const releaseOrder: string[] = [];
	const incoming = new FrameworkIncomingStream(
		releaseMetrics,
		releaseTrace,
		() => "release-probe",
	);
	incoming.attachSubscription(
		new Subscription(() => {
			releaseOrder.push("teardown");
		}),
	);
	incoming.finish({ type: "completed" }, () => {
		releaseOrder.push("onReleased");
	});
	incoming.finish({ type: "session-terminated" }, () => {
		releaseOrder.push("duplicate-release");
	});
	assertArrayEqual(
		releaseOrder,
		["teardown", "onReleased"],
		"P10 finish(outcome,onReleased) latches and releases after teardown",
	);
	assertEqual(releaseMetrics.sourceTeardowns, 1, "P10 release is one-shot");

	const synchronousReleaseOrder: string[] = [];
	const finishBeforeReturn = new FrameworkIncomingStream(
		createMetrics(),
		new TraceLog(),
		() => "sync-release-probe",
	);
	finishBeforeReturn.finish({ type: "failed", code: "handler-failed" }, () => {
		synchronousReleaseOrder.push("onReleased");
	});
	assertArrayEqual(
		synchronousReleaseOrder,
		[],
		"P10 synchronous finish waits for subscribe return",
	);
	finishBeforeReturn.attachSubscription(
		new Subscription(() => {
			synchronousReleaseOrder.push("teardown");
		}),
	);
	assertArrayEqual(
		synchronousReleaseOrder,
		["teardown", "onReleased"],
		"P10 synchronous finish releases after returned teardown",
	);

	const protocolRequest: RpcProtocolStreamRequest = {
		service: "prototype.runtime-mixed.v1",
		member: "history",
		kind: "stream-method",
		args: createArgumentsSnapshot([{ tag: "spi" }]),
	};
	assertArrayEqual(
		Object.keys(protocolRequest),
		["service", "member", "kind", "args"],
		"P10 stream request has no source/credit/seq/ACK fields",
	);
	for (const forbidden of [
		"source",
		"value",
		"error",
		"credit",
		"sequence",
		"ack",
		"recoverStream",
		"replayItem",
	]) {
		assert(!(forbidden in protocolRequest), `P10 request forbids ${forbidden}`);
	}
}

function probeProposedExportInventory(): void {
	assertArrayEqual(
		PROPOSED_ROOT_RUNTIME_EXPORTS,
		[
			"RpcAcceptorListenerStopReasonEnum",
			"RpcCallStatusEnum",
			"RpcCloseOutcomeEnum",
			"RpcCloseReasonEnum",
			"RpcConnectorReconnectionAttemptFailureStageEnum",
			"RpcConnectorReconnectionEventTypeEnum",
			"RpcConnectorReconnectionStopReasonEnum",
			"RpcEventDirectionEnum",
			"RpcEventTypeEnum",
			"RpcException",
			"RpcExceptionCodeEnum",
			"RpcStateStatusEnum",
			"RpcStreamStatusEnum",
			"createRemoteServiceDescriptor",
			"createRpcAcceptor",
			"createRpcConnector",
			"createRpcConnectorReconnection",
			"createRpcProtocol",
		],
		"P11 proposed root runtime fixture is exact and sorted",
	);
	assertArrayEqual(
		PROPOSED_PROTOCOL_RUNTIME_EXPORTS,
		[
			"RpcCallTerminalTypeEnum",
			"RpcCloseReasonEnum",
			"RpcExceptionCodeEnum",
			"RpcIncomingCallKindEnum",
			"RpcProtocolSessionTransitionTypeEnum",
			"createRpcProtocol",
		],
		"P11 proposed protocol runtime fixture is exact",
	);
	assertArrayEqual(
		PROPOSED_TRANSPORT_RUNTIME_EXPORTS,
		[],
		"P11 proposed transport runtime fixture is empty",
	);
	for (const removed of [
		"RpcCallDirectionEnum",
		"RpcPeerResult",
		"RemoteServiceGroup",
		"resolveAll",
	]) {
		assert(
			!PROPOSED_ROOT_RUNTIME_EXPORTS.includes(removed as never),
			`P11 proposed root runtime fixture removes ${removed}`,
		);
	}
	assertArrayEqual(
		Object.keys(RpcExceptionCodeEnum),
		[
			"canceled",
			"unavailable",
			"outcomeUnknown",
			"handlerFailed",
			"unknownService",
			"unknownMember",
			"overflow",
			"protocol",
		],
		"P11 proposed error vocabulary replaces unknownMethod and adds overflow",
	);
	const fixtureSession = new PrototypeSession();
	const fixtureAcceptor = new PrototypeAcceptor(fixtureSession, [
		fixtureSession.left.peer,
	]);
	assert(
		!("resolveAll" in fixtureAcceptor),
		"P11 proposed acceptor runtime has no resolveAll",
	);
	assert(
		CURRENT_PRODUCTION_NEGATIVE_BASELINE.some((line) => line.includes("still")),
		"P11 current production gaps remain an explicit negative baseline",
	);
}

async function probePeerComposition(): Promise<void> {
	const firstSession = new PrototypeSession();
	const secondSession = new PrototypeSession();
	const firstSource = new Subject<string>();
	const secondSource = new Subject<string>();
	let firstSubscriptions = 0;
	let secondSubscriptions = 0;
	let firstTeardowns = 0;
	let secondTeardowns = 0;
	const teardownOrder: string[] = [];
	const firstObservable = new Observable<string>((subscriber) => {
		firstSubscriptions += 1;
		const inner = firstSource.subscribe(subscriber);
		return () => {
			firstTeardowns += 1;
			inner.unsubscribe();
			teardownOrder.push("A");
			secondSource.next("teardown-reentrant-B");
		};
	});
	const secondObservable = new Observable<string>((subscriber) => {
		secondSubscriptions += 1;
		const inner = secondSource.subscribe(subscriber);
		return () => {
			secondTeardowns += 1;
			inner.unsubscribe();
			teardownOrder.push("B");
		};
	});
	firstSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({ messages$: firstObservable }),
	);
	secondSession.right.peer.expose(
		runtimeMixedDescriptor,
		createRuntimeImplementation({ messages$: secondObservable }),
	);
	const acceptor = new PrototypeAcceptor(firstSession, [
		firstSession.left.peer,
		secondSession.left.peer,
	]);
	const snapshot = acceptor.peers;
	assert(
		Object.isFrozen(snapshot),
		"P12 peers is a frozen membership snapshot",
	);
	assertEqual(
		acceptor.peers,
		snapshot,
		"P12 peers snapshot identity is stable",
	);
	const children = snapshot.map((peer) => ({
		peer,
		stream: peer.resolve(runtimeMixedDescriptor).messages$,
	}));
	assertEqual(firstSubscriptions, 0, "P12 peers.map does no source work");
	assertEqual(
		secondSubscriptions,
		0,
		"P12 peers.map does no source work for child two",
	);
	const correlated: Array<Readonly<{ peer: IRpcPeer; value: string }>> = [];
	const outerErrors: unknown[] = [];
	let outerCompletions = 0;
	const combined = merge(
		...children.map(({ peer, stream }) =>
			stream.pipe(map((value) => Object.freeze({ peer, value }))),
		),
	);
	const outerSubscription = combined.subscribe({
		complete: () => {
			outerCompletions += 1;
		},
		error: (error: unknown) => outerErrors.push(error),
		next: (value) => correlated.push(value),
	});
	assertEqual(
		firstSubscriptions,
		1,
		"P12 merge subscribes independent child one",
	);
	assertEqual(
		secondSubscriptions,
		1,
		"P12 merge subscribes independent child two",
	);
	firstSource.next("first-peer-item");
	secondSource.next("second-peer-item");
	await flushMicrotasks();
	assertEqual(
		correlated.length,
		2,
		"P12 application merge receives both children",
	);
	assertEqual(
		correlated[0]?.peer,
		snapshot[0],
		"P12 application preserves first peer association",
	);
	assertEqual(
		correlated[0]?.value,
		"first-peer-item",
		"P12 first value association",
	);
	assertEqual(
		correlated[1]?.peer,
		snapshot[1],
		"P12 application preserves second peer association",
	);
	assertEqual(
		correlated[1]?.value,
		"second-peer-item",
		"P12 second value association",
	);
	assert(
		firstSession.left.peer.debugStreams[0] !==
			secondSession.left.peer.debugStreams[0],
		"P12 child streams own independent state",
	);
	const correlatedBeforeUnsubscribe = correlated.length;
	const firstRearmsBeforeUnsubscribe =
		firstSession.traceLog.count("credit.rearmed");
	const secondRearmsBeforeUnsubscribe =
		secondSession.traceLog.count("credit.rearmed");
	outerSubscription.unsubscribe();
	outerSubscription.unsubscribe();
	firstSource.next("forbidden-late-A");
	secondSource.next("forbidden-late-B");
	firstSource.complete();
	secondSource.complete();
	await flushMicrotasks();
	assertEqual(
		correlated.length,
		correlatedBeforeUnsubscribe,
		"R4 outer observation receives no teardown-reentrant or late value",
	);
	assertEqual(
		outerCompletions,
		0,
		"R4 explicit outer unsubscribe receives no completion",
	);
	assertArrayEqual(
		outerErrors,
		[],
		"R4 explicit outer unsubscribe receives no terminal error",
	);
	assertArrayEqual(
		teardownOrder,
		["A", "B"],
		"R4 child A teardown attacks child B before B teardown",
	);
	assertEqual(
		firstTeardowns,
		1,
		"P12 outer unsubscribe propagates to child one",
	);
	assertEqual(
		secondTeardowns,
		1,
		"P12 outer unsubscribe propagates to child two",
	);
	assertEqual(
		firstSession.metrics.wireCancels,
		1,
		"P12 child one cancellation is independent",
	);
	assertEqual(
		secondSession.metrics.wireCancels,
		1,
		"P12 child two cancellation is independent",
	);
	for (const [label, session, rearmBaseline] of [
		["A", firstSession, firstRearmsBeforeUnsubscribe],
		["B", secondSession, secondRearmsBeforeUnsubscribe],
	] as const) {
		assertEqual(
			session.traceLog.count("cancel.intent"),
			1,
			`R4 child ${label} emits one cancel intent`,
		);
		assertEqual(
			session.traceLog.count("source.terminal-winner"),
			1,
			`R4 child ${label} has one Source terminal winner`,
		);
		assertEqual(
			session.traceLog.count("source.terminal-evidence"),
			1,
			`R4 child ${label} retains one terminal evidence record`,
		);
		assertEqual(
			session.traceLog.count("credit.rearmed"),
			rearmBaseline,
			`R4 child ${label} cannot rearm after outer unsubscribe`,
		);
		assertEqual(
			finishedStreamEvents(session.left).length,
			1,
			`R4 child ${label} has one outgoing finished event`,
		);
		assertEqual(
			finishedStreamEvents(session.right).length,
			1,
			`R4 child ${label} has one incoming finished event`,
		);
		assertEqual(
			finishedStreamEvents(session.left)[0]?.outcome,
			RpcStreamStatusEnum.canceled,
			`R4 child ${label} outgoing winner is canceled`,
		);
		assertEqual(
			finishedStreamEvents(session.right)[0]?.outcome,
			RpcStreamStatusEnum.canceled,
			`R4 child ${label} Source winner is canceled`,
		);
		assert(
			session.left.peer.debugStreams[0]?.observationOpen === false,
			`R4 child ${label} local observation cannot revive`,
		);
		assertEqual(
			session.metrics.localResources,
			0,
			`R4 child ${label} releases local resources`,
		);
		assertEqual(
			session.metrics.sourceResources,
			0,
			`R4 child ${label} releases source resources`,
		);
		assertEqual(
			session.activeStreams.size,
			0,
			`R4 child ${label} cannot resurrect a logical stream`,
		);
	}
	assert(
		!("resolveAll" in acceptor),
		"P12 composition does not recreate Group normalization/atomic/wait-all semantics",
	);
}

export type FinalStreamInterfacePrototypeReport = Readonly<{
	contract: "throwaway-prototype-only";
	prototypeResult: "passed";
	productionAcceptance: "negative-baseline-not-claimed";
	realRxjs: true;
	evidence: readonly [
		"P01",
		"P02",
		"P03",
		"P04",
		"P05",
		"P06",
		"P07",
		"P08",
		"P09",
		"P10",
		"P11-proposed-fixture-only",
		"P12",
	];
}>;

export async function runFinalStreamInterfacePrototype(): Promise<FinalStreamInterfacePrototypeReport> {
	probeDescriptorRuntime();
	await probeFacadeAndColdness();
	probeRuntimeSourceQualification();
	probeAdmissionCancellation();
	await probeSynchronousRxjsAndReentrancy();
	await probeRecoveryContinuity();
	await probeRecoveryContinuationAuthority();
	await probeRecoveredPublicationPendingHandoff();
	await probeNestedTerminationPublicationAuthority();
	await probeTelemetryAndFifo();
	await probeShutdownCutoffs();
	await probeUniqueTerminationTask();
	probeProtocolProjectionAndRelease();
	probeProposedExportInventory();
	await probePeerComposition();
	return Object.freeze({
		contract: "throwaway-prototype-only",
		evidence: Object.freeze([
			"P01",
			"P02",
			"P03",
			"P04",
			"P05",
			"P06",
			"P07",
			"P08",
			"P09",
			"P10",
			"P11-proposed-fixture-only",
			"P12",
		] as const),
		productionAcceptance: "negative-baseline-not-claimed",
		prototypeResult: "passed",
		realRxjs: true,
	});
}
