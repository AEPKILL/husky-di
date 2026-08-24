/**
 * @overview Compile-only positive and negative probes for the proposed final
 * Remote Observable Interface. Every expected-error directive must be consumed by the
 * strict noEmit command; this file is never part of a production package.
 *
 * @author AEPKILL
 * @created 2026-08-23 00:00:00
 */

import { Observable, type Subject } from "rxjs";
import {
	createRemoteServiceDescriptor,
	createServiceIdentifier,
	type IRemoteServiceDescriptor,
	type IRpcAcceptor,
	type IRpcApplicationSnapshot,
	type IRpcConnection,
	type IRpcPeer,
	type IRpcProtocolIncomingStream,
	type IRpcProtocolProjection,
	type IRpcProtocolSession,
	type IRpcProtocolSourceEmissionReservation,
	type IRpcProtocolSourceSink,
	type IRpcProtocolStream,
	type IRpcProtocolSubscriberSink,
	type PROPOSED_PROTOCOL_RUNTIME_EXPORTS,
	type PROPOSED_PROTOCOL_STREAM_TYPE_ADDITIONS,
	type PROPOSED_ROOT_RUNTIME_EXPORTS,
	type PROPOSED_ROOT_TYPE_EXPORTS,
	type PROPOSED_TRANSPORT_RUNTIME_EXPORTS,
	type RpcApplicationValue,
	RpcEventDirectionEnum,
	RpcEventTypeEnum,
	RpcExceptionCodeEnum,
	type RpcIncomingStreamTerminal,
	type RpcMemberDefinitions,
	type RpcProtocolStreamRequest,
	type RpcSourceTerminal,
	RpcStreamStatusEnum,
} from "./final-stream-interface.prototype.ts";

type Message = Readonly<{ id: string; body: string }>;
type Query = Readonly<{ room: string }>;

interface MixedService {
	lookup(id: string): Message;
	cancelableLookup(id: string, signal: AbortSignal): Promise<Message>;
	history(query: Query): Observable<Message>;
	readonly messages$: Observable<Message>;
	readonly applicationOwned$: Subject<Message>;
}

const mixedIdentifier = createServiceIdentifier<MixedService>("MixedService");

const mixedDescriptor = createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.mixed-service.v1",
	members: {
		lookup: { kind: "unary" },
		cancelableLookup: { kind: "unary", cancelable: true },
		history: { kind: "stream-method" },
		messages$: { kind: "stream-property" },
		applicationOwned$: { kind: "stream-property" },
	},
});

interface UnaryAndHybridService {
	normal(): Promise<Message>;
	hybrid(): Observable<Message> & PromiseLike<Message>;
}

const unaryAndHybridIdentifier = createServiceIdentifier<UnaryAndHybridService>(
	"UnaryAndHybridService",
);

const unaryAndHybridDescriptor = createRemoteServiceDescriptor(
	unaryAndHybridIdentifier,
	{
		wireName: "prototype.unary-and-hybrid.v1",
		members: {
			normal: { kind: "unary" },
			hybrid: { kind: "stream-method" },
		},
	},
);

createRemoteServiceDescriptor(unaryAndHybridIdentifier, {
	wireName: "prototype.invalid.hybrid-as-unary",
	// @ts-expect-error Observable & PromiseLike intersections are stream-only.
	members: {
		hybrid: { kind: "unary" },
	},
});

declare const peer: IRpcPeer;
declare const mixedImplementation: MixedService;

peer.expose(mixedDescriptor, mixedImplementation);
const mixedRemote = peer.resolve(mixedDescriptor);
const { lookup, cancelableLookup, history } = mixedRemote;
const unaryResult: Promise<Message> = lookup("m-1");
const cancelableResult: Promise<Message> = cancelableLookup("m-1", undefined);
const cancelableWithSignal: Promise<Message> = cancelableLookup(
	"m-1",
	new AbortController().signal,
);
const methodStream: Observable<Message> = history({ room: "r-1" });
const propertyStream: Observable<Message> = mixedRemote.messages$;
const narrowedSubject: Observable<Message> = mixedRemote.applicationOwned$;
const nonThenable: undefined = mixedRemote.then;
const assimilatedFacade: Promise<typeof mixedRemote> =
	Promise.resolve(mixedRemote);
const assimilatedStream: Promise<Observable<Message>> = Promise.resolve(
	mixedRemote.messages$,
);
const unaryAndHybridRemote = peer.resolve(unaryAndHybridDescriptor);
const normalPromise: Promise<Message> = unaryAndHybridRemote.normal();
const hybridStream: Observable<Message> = unaryAndHybridRemote.hybrid();

void unaryResult;
void cancelableResult;
void cancelableWithSignal;
void methodStream;
void propertyStream;
void narrowedSubject;
void nonThenable;
void assimilatedFacade;
void assimilatedStream;
void normalPromise;
void hybridStream;

// @ts-expect-error The caller control slot is exact and required.
cancelableLookup("m-1");
// @ts-expect-error A Remote Observable does not expose Subject.next().
mixedRemote.applicationOwned$.next({ id: "m-2", body: "no" });
// @ts-expect-error A Remote Observable does not expose Subject.error().
mixedRemote.applicationOwned$.error(new Error("no"));
// @ts-expect-error A Remote Observable does not expose Subject.complete().
mixedRemote.applicationOwned$.complete();

interface WiderMixedService extends MixedService {
	extra(): Message;
}

const widerDescriptor = createRemoteServiceDescriptor(
	createServiceIdentifier<WiderMixedService>("WiderMixedService"),
	{
		wireName: "prototype.wider-mixed-service.v1",
		members: {
			lookup: { kind: "unary" },
			cancelableLookup: { kind: "unary", cancelable: true },
			history: { kind: "stream-method" },
			messages$: { kind: "stream-property" },
			applicationOwned$: { kind: "stream-property" },
		},
	},
);

// @ts-expect-error Descriptor service type T is invariant.
const invalidServiceWidening: typeof mixedDescriptor = widerDescriptor;
// @ts-expect-error Descriptor service type T is invariant in the other direction.
const invalidServiceNarrowing: typeof widerDescriptor = mixedDescriptor;
void invalidServiceWidening;
void invalidServiceNarrowing;

const lookupOnlyDescriptor = createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.lookup-only.v1",
	members: { lookup: { kind: "unary" } },
});

// @ts-expect-error Exact selected Members are invariant.
const invalidMemberWidening: typeof mixedDescriptor = lookupOnlyDescriptor;
// @ts-expect-error Exact selected Members are invariant in the other direction.
const invalidMemberNarrowing: typeof lookupOnlyDescriptor = mixedDescriptor;
void invalidMemberWidening;
void invalidMemberNarrowing;

createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.invalid.empty",
	// @ts-expect-error A Descriptor must select at least one member.
	members: {},
});

interface ThenService {
	then(value: string): string;
}

createRemoteServiceDescriptor(
	createServiceIdentifier<ThenService>("ThenService"),
	{
		wireName: "prototype.invalid.then",
		// @ts-expect-error Exact member name then is reserved.
		members: {
			// biome-ignore lint/suspicious/noThenProperty: required reserved-name negative probe.
			then: { kind: "unary" },
		},
	},
);

createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.invalid.extra-field",
	members: {
		// @ts-expect-error Member definitions reject extra fields.
		lookup: { kind: "unary", extra: true },
	},
});

createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.invalid.cancelable-false",
	// @ts-expect-error cancelable:false is not a definition shape.
	members: {
		cancelableLookup: { kind: "unary", cancelable: false },
	},
});

createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.invalid.stream-cancelable",
	members: {
		// @ts-expect-error Stream definitions cannot carry cancelable.
		history: { kind: "stream-method", cancelable: true },
	},
});

createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.invalid.wrong-kind",
	// @ts-expect-error Observable-returning method cannot be unary.
	members: {
		history: { kind: "unary" },
	},
});

createRemoteServiceDescriptor(mixedIdentifier, {
	wireName: "prototype.invalid.unary-as-stream",
	// @ts-expect-error Unary-returning method cannot be a stream method.
	members: {
		lookup: { kind: "stream-method" },
	},
});

// @ts-expect-error A selected member is required on the exposure implementation.
peer.expose(mixedDescriptor, { lookup: mixedImplementation.lookup });

interface InvalidProperties {
	mutable$: Observable<Message>;
	readonly optional$?: Observable<Message>;
	readonly noSuffix: Observable<Message>;
}

const invalidPropertiesIdentifier =
	createServiceIdentifier<InvalidProperties>("InvalidProperties");

createRemoteServiceDescriptor(invalidPropertiesIdentifier, {
	wireName: "prototype.invalid.mutable-property",
	// @ts-expect-error A stream property must be readonly.
	members: {
		mutable$: { kind: "stream-property" },
	},
});

createRemoteServiceDescriptor(invalidPropertiesIdentifier, {
	wireName: "prototype.invalid.optional-property",
	// @ts-expect-error A stream property must be required.
	members: {
		optional$: { kind: "stream-property" },
	},
});

createRemoteServiceDescriptor(invalidPropertiesIdentifier, {
	wireName: "prototype.invalid.non-dollar-property",
	// @ts-expect-error A stream property key must end in $.
	members: {
		noSuffix: { kind: "stream-property" },
	},
});

type ObservableInteropOnly<Item> = {
	readonly [Symbol.observable]: () => Observable<Item>;
};

interface InvalidCapabilities {
	// biome-ignore lint/suspicious/noExplicitAny: deliberate negative type probe.
	anyArgument(value: any): Observable<Message>;
	// biome-ignore lint/suspicious/noExplicitAny: deliberate negative type probe.
	anyItem(query: Query): Observable<any>;
	// biome-ignore lint/suspicious/noExplicitAny: deliberate negative type probe.
	anyResult(query: Query): any;
	observableArgument(value: Observable<Message>): Observable<Message>;
	abortFirst(signal: AbortSignal, query: Query): Observable<Message>;
	abortOptional(query: Query, signal?: AbortSignal): Observable<Message>;
	promiseObservable(query: Query): Promise<Observable<Message>>;
	nestedObservable(query: Query): Observable<Observable<Message>>;
	promiseLikeItem(query: Query): Observable<PromiseLike<Message>>;
	asyncIterableResult(query: Query): AsyncIterable<Message>;
	asyncIterableArgument(value: AsyncIterable<Message>): Observable<Message>;
	asyncIterableItem(query: Query): Observable<AsyncIterable<Message>>;
	readableResult(query: Query): ReadableStream<Message>;
	readableArgument(value: ReadableStream<Message>): Observable<Message>;
	readableItem(query: Query): Observable<ReadableStream<Message>>;
	interopOnly(query: Query): ObservableInteropOnly<Message>;
	neverResult(query: Query): never;
}

const invalidCapabilitiesIdentifier =
	createServiceIdentifier<InvalidCapabilities>("InvalidCapabilities");

type InvalidCapabilityName = keyof InvalidCapabilities;
function rejectInvalidCapability(
	member: InvalidCapabilityName,
	definition: { readonly kind: "stream-method" },
): void {
	void member;
	void definition;
}

// These local calls document the negative inventory without weakening the
// independent Descriptor checks below.
rejectInvalidCapability("observableArgument", { kind: "stream-method" });
rejectInvalidCapability("anyArgument", { kind: "stream-method" });
rejectInvalidCapability("anyItem", { kind: "stream-method" });
rejectInvalidCapability("anyResult", { kind: "stream-method" });
rejectInvalidCapability("abortFirst", { kind: "stream-method" });
rejectInvalidCapability("abortOptional", { kind: "stream-method" });
rejectInvalidCapability("promiseObservable", { kind: "stream-method" });
rejectInvalidCapability("nestedObservable", { kind: "stream-method" });
rejectInvalidCapability("promiseLikeItem", { kind: "stream-method" });
rejectInvalidCapability("asyncIterableResult", { kind: "stream-method" });
rejectInvalidCapability("asyncIterableArgument", { kind: "stream-method" });
rejectInvalidCapability("asyncIterableItem", { kind: "stream-method" });
rejectInvalidCapability("readableResult", { kind: "stream-method" });
rejectInvalidCapability("readableArgument", { kind: "stream-method" });
rejectInvalidCapability("readableItem", { kind: "stream-method" });
rejectInvalidCapability("interopOnly", { kind: "stream-method" });
rejectInvalidCapability("neverResult", { kind: "stream-method" });

createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.any-argument",
	// @ts-expect-error any parameters are forbidden.
	members: {
		anyArgument: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.any-item",
	// @ts-expect-error Observable<any> is forbidden.
	members: {
		anyItem: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.any-result",
	// @ts-expect-error any is not a direct Observable contract.
	members: {
		anyResult: { kind: "stream-method" },
	},
});

createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.observable-argument",
	// @ts-expect-error Observable parameters are forbidden.
	members: {
		observableArgument: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.abort-first",
	// @ts-expect-error Stream AbortSignal is forbidden in any position.
	members: {
		abortFirst: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.abort-optional",
	// @ts-expect-error Optional stream AbortSignal is forbidden.
	members: {
		abortOptional: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.promise-observable",
	// @ts-expect-error Promise<Observable> is not a direct Observable.
	members: {
		promiseObservable: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.nested-observable",
	// @ts-expect-error Observable<Observable> is forbidden.
	members: {
		nestedObservable: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.promise-like-item",
	// @ts-expect-error PromiseLike stream items are forbidden.
	members: {
		promiseLikeItem: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.async-iterable-result",
	// @ts-expect-error AsyncIterable is not a direct Observable return.
	members: {
		asyncIterableResult: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.async-iterable-argument",
	// @ts-expect-error AsyncIterable parameters are forbidden.
	members: {
		asyncIterableArgument: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.async-iterable-item",
	// @ts-expect-error AsyncIterable stream items are forbidden.
	members: {
		asyncIterableItem: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.readable-result",
	// @ts-expect-error ReadableStream is not a direct Observable return.
	members: {
		readableResult: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.readable-argument",
	// @ts-expect-error ReadableStream parameters are forbidden.
	members: {
		readableArgument: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.readable-item",
	// @ts-expect-error ReadableStream items are forbidden.
	members: {
		readableItem: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.interop-only",
	// @ts-expect-error Symbol.observable interop alone is not accepted.
	members: {
		interopOnly: { kind: "stream-method" },
	},
});
createRemoteServiceDescriptor(invalidCapabilitiesIdentifier, {
	wireName: "prototype.invalid.never",
	// @ts-expect-error never is not a stream item or result contract.
	members: {
		neverResult: { kind: "stream-method" },
	},
});

const applicationThenData: RpcApplicationValue = {
	// biome-ignore lint/suspicious/noThenProperty: required ordinary Application Value probe.
	then: "ordinary-data",
};
void applicationThenData;

declare const snapshot: IRpcApplicationSnapshot;
declare const subscriberSink: IRpcProtocolSubscriberSink;
declare const sourceSink: IRpcProtocolSourceSink;
declare const sourceEmission: IRpcProtocolSourceEmissionReservation;
declare const incomingStream: IRpcProtocolIncomingStream;
declare const protocolStream: IRpcProtocolStream;
declare const protocolSession: IRpcProtocolSession;

const itemProjection: IRpcProtocolProjection<"rearm" | "closed"> =
	subscriberSink.reserveItem(snapshot);
const terminalProjection: IRpcProtocolProjection =
	subscriberSink.reserveTerminal({
		type: "completed",
	});
const emissionReservation = sourceSink.reserveEmission();
emissionReservation?.commit(snapshot);
sourceEmission.fail();
sourceSink.finish({ type: "completed" });
incomingStream.finish({ type: "session-terminated" }, () => undefined);
protocolStream.start();
protocolStream.cancel();
protocolSession.reserveStream({
	service: "prototype.mixed-service.v1",
	member: "history",
	kind: "stream-method",
	args: snapshot as never,
});
void itemProjection;
void terminalProjection;

// @ts-expect-error Projection does not expose an eager raw value.
itemProjection.value;
// @ts-expect-error Projection does not expose credit.
itemProjection.credit;
// @ts-expect-error Protocol stream does not expose recovery controls.
protocolStream.recoverStream();
// @ts-expect-error Protocol stream does not expose replayItem.
protocolStream.replayItem(1);
// @ts-expect-error Public source sink does not expose sequence numbers.
sourceSink.sequence;
// @ts-expect-error Public source sink does not expose ACK state.
sourceSink.ack;

const failedSourceTerminal: RpcSourceTerminal = {
	type: "failed",
	code: "handler-failed",
};
void failedSourceTerminal;

const rawErrorTerminal: RpcIncomingStreamTerminal = {
	type: "failed",
	code: "handler-failed",
	// @ts-expect-error Incoming terminal cannot carry a raw Error.
	error: new Error("must not cross the seam"),
};
void rawErrorTerminal;

const rawObservableRequest: RpcProtocolStreamRequest = {
	service: "prototype.mixed-service.v1",
	member: "history",
	kind: "stream-method",
	args: snapshot as never,
	// @ts-expect-error A stream request cannot carry a raw Observable source.
	source: new Observable<Message>(),
};
void rawObservableRequest;

type ConnectionKey = keyof IRpcConnection;
const connectionKeys: readonly ConnectionKey[] = ["message$", "send", "close"];
// @ts-expect-error Transport does not expose stream capacity.
const transportCapacity: ConnectionKey = "capacity";
// @ts-expect-error Transport does not expose pause.
const transportPause: ConnectionKey = "pause";
void connectionKeys;
void transportCapacity;
void transportPause;

type RootRuntimeExportName = (typeof PROPOSED_ROOT_RUNTIME_EXPORTS)[number];
type RootTypeExportName = (typeof PROPOSED_ROOT_TYPE_EXPORTS)[number];
type ProtocolRuntimeExportName =
	(typeof PROPOSED_PROTOCOL_RUNTIME_EXPORTS)[number];
type ProtocolStreamTypeName =
	(typeof PROPOSED_PROTOCOL_STREAM_TYPE_ADDITIONS)[number];
type TransportRuntimeExportName =
	(typeof PROPOSED_TRANSPORT_RUNTIME_EXPORTS)[number];

const positiveRootEventDirection: RootRuntimeExportName =
	"RpcEventDirectionEnum";
const positiveRootStreamStatus: RootRuntimeExportName = "RpcStreamStatusEnum";
const positiveRootEventType: RootTypeExportName = "RpcEvent";
const positiveRootPolicyType: RootTypeExportName = "IRpcProtocolRuntimePolicy";
const positiveProtocolFactory: ProtocolRuntimeExportName = "createRpcProtocol";
const positiveProtocolStreamType: ProtocolStreamTypeName =
	"IRpcProtocolSubscriberSink";
// @ts-expect-error The proposed root runtime inventory deletes the old direction enum.
const removedCallDirection: RootRuntimeExportName = "RpcCallDirectionEnum";
// @ts-expect-error No Group runtime export survives.
const removedServiceGroup: RootRuntimeExportName = "RemoteServiceGroup";
// @ts-expect-error The proposed root type inventory deletes RpcPeerResult.
const removedPeerResultType: RootTypeExportName = "RpcPeerResult";
// @ts-expect-error The proposed root type inventory deletes RemoteServiceGroup.
const removedServiceGroupType: RootTypeExportName = "RemoteServiceGroup";
// @ts-expect-error The transport subpath has no runtime exports.
const removedTransportRuntime: TransportRuntimeExportName =
	"createStreamTransport";
void positiveRootEventDirection;
void positiveRootStreamStatus;
void positiveRootEventType;
void positiveRootPolicyType;
void positiveProtocolFactory;
void positiveProtocolStreamType;
void removedCallDirection;
void removedServiceGroup;
void removedPeerResultType;
void removedServiceGroupType;
void removedTransportRuntime;

declare const acceptor: IRpcAcceptor;
// @ts-expect-error IRpcAcceptor no longer exposes resolveAll().
acceptor.resolveAll(mixedDescriptor);
// @ts-expect-error The proposed final error vocabulary deletes unknownMethod.
RpcExceptionCodeEnum.unknownMethod;
const removedPolicy: import("./final-stream-interface.prototype.ts").IRpcProtocolRuntimePolicy =
	{
		// @ts-expect-error The proposed final policy deletes the old pending-invocation key.
		maxPendingInvocationsPerSession: 1,
	};
void removedPolicy;

const positiveEventVocabulary = [
	RpcEventTypeEnum.streamStarted,
	RpcEventTypeEnum.streamFinished,
	RpcEventDirectionEnum.incoming,
	RpcStreamStatusEnum.terminated,
	RpcExceptionCodeEnum.unknownMember,
	RpcExceptionCodeEnum.overflow,
] as const;
void positiveEventVocabulary;

type MemberContract = RpcMemberDefinitions<MixedService>;
const positiveMemberContract: MemberContract = {
	lookup: { kind: "unary" },
	history: { kind: "stream-method" },
	messages$: { kind: "stream-property" },
};
void positiveMemberContract;

type ExactMixedDescriptor = IRemoteServiceDescriptor<
	MixedService,
	{
		readonly lookup: { readonly kind: "unary" };
		readonly history: { readonly kind: "stream-method" };
	}
>;
declare const exactMixedDescriptor: ExactMixedDescriptor;
void exactMixedDescriptor;
