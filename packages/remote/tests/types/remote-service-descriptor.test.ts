/**
 * @overview Compile-time mixed Remote Service Descriptor specification probes.
 * @author AEPKILL
 * @created 2026-08-24 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable, Subject } from "rxjs";

import {
	createRemoteServiceDescriptor,
	type IRemoteServiceDescriptor,
	type IRpcPeer,
} from "../../src/index";

type Message = Readonly<{ id: string; body: string }>;

interface MixedService {
	lookup(id: string): Message;
	cancelableLookup(id: string, signal: AbortSignal): Promise<Message>;
	history(room: string): Observable<Message>;
	readonly messages$: Observable<Message>;
	readonly applicationOwned$: Subject<Message>;
}

const IMixedService = createServiceIdentifier<MixedService>("IMixedService");

const mixedDescriptor = createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.mixed.v1",
	members: {
		lookup: { kind: "unary" },
		cancelableLookup: { kind: "unary", cancelable: true },
		history: { kind: "stream-method" },
		messages$: { kind: "stream-property" },
		applicationOwned$: { kind: "stream-property" },
	},
});

const exactDescriptor: IRemoteServiceDescriptor<
	MixedService,
	{
		readonly lookup: { readonly kind: "unary" };
		readonly cancelableLookup: {
			readonly kind: "unary";
			readonly cancelable: true;
		};
		readonly history: { readonly kind: "stream-method" };
		readonly messages$: { readonly kind: "stream-property" };
		readonly applicationOwned$: { readonly kind: "stream-property" };
	}
> = mixedDescriptor;
void exactDescriptor;

declare const peer: IRpcPeer;
declare const implementation: MixedService;
peer.expose(mixedDescriptor, implementation);

const remote = peer.resolve(mixedDescriptor);
const remoteLookup: Promise<Message> = remote.lookup("message-1");
const remoteCancelableLookup: Promise<Message> = remote.cancelableLookup(
	"message-1",
	undefined,
);
const remoteHistory: Observable<Message> = remote.history("room-1");
const remoteMessages: Observable<Message> = remote.messages$;
const remoteApplicationOwned: Observable<Message> = remote.applicationOwned$;
void remoteLookup;
void remoteCancelableLookup;
void remoteHistory;
void remoteMessages;
void remoteApplicationOwned;

// @ts-expect-error RPC-DESC-013 narrows an application-owned Subject to Observable.
remote.applicationOwned$.next({ id: "message-1", body: "hello" });
// @ts-expect-error RPC-DESC-010 keeps a remote stream property readonly.
remote.messages$ = remoteMessages;
// @ts-expect-error The remote facade contains exactly the selected members.
remote.missing;

// @ts-expect-error Every selected member is required on the implementation.
peer.expose(mixedDescriptor, { lookup: implementation.lookup });

interface WiderMixedService extends MixedService {
	extra(): Message;
}

const widerDescriptor = createRemoteServiceDescriptor(
	createServiceIdentifier<WiderMixedService>("IWiderMixedService"),
	{
		wireName: "example.wider.v1",
		members: {
			lookup: { kind: "unary" },
			cancelableLookup: { kind: "unary", cancelable: true },
			history: { kind: "stream-method" },
			messages$: { kind: "stream-property" },
			applicationOwned$: { kind: "stream-property" },
		},
	},
);

// @ts-expect-error RPC-DESC-001 keeps service types invariant.
const invalidServiceWidening: typeof mixedDescriptor = widerDescriptor;
// @ts-expect-error RPC-DESC-001 keeps service types invariant in both directions.
const invalidServiceNarrowing: typeof widerDescriptor = mixedDescriptor;
void invalidServiceWidening;
void invalidServiceNarrowing;

const unaryOnlyDescriptor = createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.unary-only.v1",
	members: { lookup: { kind: "unary" } },
});

// @ts-expect-error RPC-DESC-001 keeps exact member definitions invariant.
const invalidMemberWidening: typeof mixedDescriptor = unaryOnlyDescriptor;
// @ts-expect-error RPC-DESC-001 keeps exact member definitions invariant in both directions.
const invalidMemberNarrowing: typeof unaryOnlyDescriptor = mixedDescriptor;
void invalidMemberWidening;
void invalidMemberNarrowing;

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.empty.v1",
	// @ts-expect-error RPC-DESC-006 requires a non-empty allowlist.
	members: {},
});

interface ThenService {
	then(value: string): string;
}

createRemoteServiceDescriptor(createServiceIdentifier<ThenService>("IThen"), {
	wireName: "example.then.v1",
	// @ts-expect-error RPC-DESC-006 reserves the exact member name then.
	members: {
		// biome-ignore lint/suspicious/noThenProperty: verifies the reserved member is rejected.
		then: { kind: "unary" },
	},
});

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.extra-definition-field.v1",
	members: {
		// @ts-expect-error RPC-DESC-006 rejects extra definition fields.
		lookup: { kind: "unary", extra: true },
	},
});

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.cancelable-false.v1",
	// @ts-expect-error RPC-DESC-006 rejects cancelable false.
	members: { cancelableLookup: { kind: "unary", cancelable: false } },
});

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.stream-cancelable.v1",
	members: {
		// @ts-expect-error RPC-DESC-006 rejects cancelable on a stream.
		history: { kind: "stream-method", cancelable: true },
	},
});

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.wrong-method-kind.v1",
	// @ts-expect-error RPC-DESC-007 rejects an Observable method as unary.
	members: { history: { kind: "unary" } },
});

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.wrong-unary-kind.v1",
	// @ts-expect-error RPC-DESC-007 rejects a unary method as a stream method.
	members: { lookup: { kind: "stream-method" } },
});

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.unknown-member.v1",
	// @ts-expect-error RPC-DESC-006 rejects members outside the service.
	members: { missing: { kind: "unary" } },
});

createRemoteServiceDescriptor(
	IMixedService,
	// @ts-expect-error RPC-DESC-006 retires the methods option.
	{ wireName: "example.legacy.v1", methods: { lookup: true } },
);

createRemoteServiceDescriptor(IMixedService, {
	wireName: "example.extra-option.v1",
	members: { lookup: { kind: "unary" } },
	// @ts-expect-error RPC-DESC-006 closes the outer options record.
	extra: true,
});

interface InvalidProperties {
	mutable$: Observable<Message>;
	readonly optional$?: Observable<Message>;
	readonly noSuffix: Observable<Message>;
	readonly notObservable$: Message;
	readonly propertyMethod$: () => Observable<Message>;
}

const IInvalidProperties =
	createServiceIdentifier<InvalidProperties>("IInvalidProperties");

createRemoteServiceDescriptor(IInvalidProperties, {
	wireName: "example.mutable-property.v1",
	// @ts-expect-error RPC-DESC-010 requires readonly stream properties.
	members: { mutable$: { kind: "stream-property" } },
});

createRemoteServiceDescriptor(IInvalidProperties, {
	wireName: "example.optional-property.v1",
	// @ts-expect-error RPC-DESC-010 requires a required stream property.
	members: { optional$: { kind: "stream-property" } },
});

createRemoteServiceDescriptor(IInvalidProperties, {
	wireName: "example.no-suffix.v1",
	// @ts-expect-error RPC-DESC-010 requires a $ suffix.
	members: { noSuffix: { kind: "stream-property" } },
});

createRemoteServiceDescriptor(IInvalidProperties, {
	wireName: "example.non-observable-property.v1",
	// @ts-expect-error RPC-DESC-010 requires a direct Observable value.
	members: { notObservable$: { kind: "stream-property" } },
});

createRemoteServiceDescriptor(IInvalidProperties, {
	wireName: "example.method-as-property.v1",
	// @ts-expect-error RPC-DESC-010 rejects method-shaped stream properties.
	members: { propertyMethod$: { kind: "stream-property" } },
});

interface InvalidCapabilities {
	// biome-ignore lint/suspicious/noExplicitAny: deliberate negative type probe.
	anyArgument(value: any): Observable<Message>;
	// biome-ignore lint/suspicious/noExplicitAny: deliberate negative type probe.
	anyItem(): Observable<any>;
	// biome-ignore lint/suspicious/noExplicitAny: deliberate negative type probe.
	anyResult(): any;
	observableArgument(value: Observable<Message>): Observable<Message>;
	abortArgument(signal: AbortSignal): Observable<Message>;
	promiseArgument(value: PromiseLike<Message>): Observable<Message>;
	iterableArgument(value: AsyncIterable<Message>): Observable<Message>;
	readableArgument(value: ReadableStream<Message>): Observable<Message>;
	unionArgument(value: Message | Observable<Message>): Observable<Message>;
	promiseObservable(): Promise<Observable<Message>>;
	nestedObservable(): Observable<Observable<Message>>;
	promiseLikeItem(): Observable<PromiseLike<Message>>;
	iterableResult(): AsyncIterable<Message>;
	iterableItem(): Observable<AsyncIterable<Message>>;
	readableResult(): ReadableStream<Message>;
	readableItem(): Observable<ReadableStream<Message>>;
	neverResult(): never;
}

const IInvalidCapabilities = createServiceIdentifier<InvalidCapabilities>(
	"IInvalidCapabilities",
);

type InvalidStreamMember = Exclude<
	keyof InvalidCapabilities,
	"iterableResult" | "readableResult"
>;

function rejectStreamMember(member: InvalidStreamMember): void {
	createRemoteServiceDescriptor(IInvalidCapabilities, {
		wireName: `example.invalid.${member}`,
		// @ts-expect-error RPC-DESC-007/011/012 reject this selected stream shape.
		members: { [member]: { kind: "stream-method" } },
	});
}

rejectStreamMember("anyArgument");
rejectStreamMember("anyItem");
rejectStreamMember("anyResult");
rejectStreamMember("observableArgument");
rejectStreamMember("abortArgument");
rejectStreamMember("promiseArgument");
rejectStreamMember("iterableArgument");
rejectStreamMember("readableArgument");
rejectStreamMember("unionArgument");
rejectStreamMember("promiseObservable");
rejectStreamMember("nestedObservable");
rejectStreamMember("promiseLikeItem");
rejectStreamMember("iterableItem");
rejectStreamMember("readableItem");
rejectStreamMember("neverResult");

createRemoteServiceDescriptor(IInvalidCapabilities, {
	wireName: "example.iterable-result.v1",
	// @ts-expect-error RPC-DESC-007 rejects AsyncIterable as a stream result.
	members: { iterableResult: { kind: "stream-method" } },
});

createRemoteServiceDescriptor(IInvalidCapabilities, {
	wireName: "example.readable-result.v1",
	// @ts-expect-error RPC-DESC-007 rejects ReadableStream as a stream result.
	members: { readableResult: { kind: "stream-method" } },
});

interface UnaryAndHybridService {
	normal(): Promise<Message>;
	hybrid(): Observable<Message> & PromiseLike<Message>;
}

const IUnaryAndHybrid =
	createServiceIdentifier<UnaryAndHybridService>("IUnaryAndHybrid");

createRemoteServiceDescriptor(IUnaryAndHybrid, {
	wireName: "example.unary-and-hybrid.v1",
	members: {
		normal: { kind: "unary" },
		hybrid: { kind: "stream-method" },
	},
});

createRemoteServiceDescriptor(IUnaryAndHybrid, {
	wireName: "example.hybrid-unary.v1",
	// @ts-expect-error RPC-DESC-012 checks both raw and awaited unary results.
	members: { hybrid: { kind: "unary" } },
});

// biome-ignore format: keeps the missing-export diagnostic on the expected line.
// @ts-expect-error RPC-PKG-015 does not export conditional helper types.
type MissingRpcMemberDefinitions = import("../../src/index").RpcMemberDefinitions;
void (null as unknown as MissingRpcMemberDefinitions);
