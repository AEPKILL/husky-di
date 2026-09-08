/**
 * @overview Migrated Remote contract specification and type regression tests.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import { type Cleanup, createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { describe, expect, expectTypeOf, it } from "vitest";
import type * as RemoteRoot from "../src/index";
import { createRemoteServiceDescriptor } from "../src/index";
import type {
	IRpcAcceptor,
	IRpcConnector,
	IRpcConnectorSessionLifecycle,
	IRpcConnectorSessionLifecycleAttachment,
	RpcAcceptorListenerState,
	RpcAcceptorState,
	RpcConnectorConnectOptions,
	RpcConnectorState,
	RpcEvent,
	RpcEventTypeEnum,
	RpcOwnerCloseReason,
} from "../src/modules/owner";
import type {
	IRpcPeer,
	IRpcPeerStateView,
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
	RpcPeerState,
} from "../src/modules/peer";
import {
	type RemoteMethodKey,
	type RemoteService,
	type RemoteServiceDescriptor,
	type RemoteServiceDescriptorOptions,
	type RemoteServiceDescriptorOptionsSnapshot,
	type RemoteServiceImplementation,
	type RpcMethodDefinitions,
	remoteServiceDescriptorOptionsSchema,
} from "../src/modules/peer";
import type {
	IRpcProtocolConnector,
	IRpcProtocolConnectorLifecycleHost,
	IRpcProtocolSessionLifecycle,
	IRpcProtocolSessionLifecycleHost,
	RpcProtocolSessionTransition,
	RpcProtocolSessionTransitionTypeEnum,
} from "../src/modules/protocol";
import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "../src/modules/transport";
import type { RpcCloseOutcomeEnum } from "../src/shared/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "../src/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../src/shared/enums/rpc-exception-code.enum";
import type { RpcStateStatusEnum } from "../src/shared/enums/rpc-state-status.enum";
import { RpcException } from "../src/shared/exceptions/rpc.exception";

describe("Remote Service Descriptor specification", () => {
	it("RPC-DESC-007: creates a frozen descriptor with readable metadata and rejects invalid options", () => {
		type Calculator = { add(left: number, right: number): number };
		const ICalculator = createServiceIdentifier<Calculator>("Calculator");
		const descriptor = createRemoteServiceDescriptor(ICalculator, {
			wireName: "calculator.v1",
			methods: { add: true },
		});

		expectTypeOf(descriptor).toEqualTypeOf<
			RemoteServiceDescriptor<Calculator, { readonly add: true }>
		>();
		expect(Object.isFrozen(descriptor)).toBe(true);
		expect(Object.getPrototypeOf(descriptor)).toBeNull();
		expect(descriptor.serviceIdentifier).toBe(ICalculator);
		expect(descriptor.wireName).toBe("calculator.v1");
		expect(descriptor.methods).toEqual({ add: true });
		expect(() =>
			createRemoteServiceDescriptor(ICalculator, {
				wireName: "",
				methods: { add: true },
			}),
		).toThrow(TypeError);
	});

	it("RPC-DESC-007: exposes an immutable metadata snapshot while preserving the caller's identifier", () => {
		class QueryService {
			query(_signal: AbortSignal): string {
				return "value";
			}
		}
		const options = {
			wireName: "query.v1",
			methods: { query: { cancelable: true as const } },
		};
		const descriptor = createRemoteServiceDescriptor(QueryService, options);

		expect(descriptor.serviceIdentifier).toBe(QueryService);
		expect(Object.isFrozen(QueryService)).toBe(false);
		expect(Object.isFrozen(QueryService.prototype)).toBe(false);
		expect(Object.getPrototypeOf(descriptor.methods)).toBeNull();
		expect(Object.isFrozen(descriptor.methods)).toBe(true);
		expect(Object.isFrozen(descriptor.methods.query)).toBe(true);

		options.wireName = "query.v2";
		expect(Reflect.set(options.methods.query, "cancelable", false)).toBe(true);
		expect(Reflect.set(options.methods, "query", true)).toBe(true);
		expect(descriptor.wireName).toBe("query.v1");
		expect(descriptor.methods).toEqual({ query: { cancelable: true } });
		expect(Reflect.set(descriptor, "wireName", "changed")).toBe(false);
		expect(Reflect.set(descriptor.methods, "query", true)).toBe(false);
		expect(Reflect.set(descriptor.methods.query, "cancelable", false)).toBe(
			false,
		);
	});

	it("RPC-DESC-001: selects only required string methods and reserves then", () => {
		type Service = {
			query(): string;
			optional?(): string;
			then(): string;
			0(): string;
			[Symbol.iterator](): Iterator<string>;
			value: string;
		};

		expectTypeOf<RemoteMethodKey<Service>>().toEqualTypeOf<"query">();
		expectTypeOf<
			// biome-ignore lint/complexity/noBannedTypes: an empty object literal infers this allowlist type.
			RemoteServiceDescriptorOptions<Service, {}>["methods"]
		>().toBeNever();
		expectTypeOf<
			RemoteServiceDescriptorOptions<
				Service,
				RpcMethodDefinitions<Service>
			>["methods"]
		>().toBeNever();
	});

	it("RPC-DESC-001: rejects extra allowlist entries even on existing objects", () => {
		type Service = { query(): string };
		type Definitions = { query: true; then: true; missing: true };

		expectTypeOf<Definitions>().not.toMatchTypeOf<
			RemoteServiceDescriptorOptions<Service, Definitions>["methods"]
		>();
	});

	it("RPC-DESC-002: recognizes cancellation after an unknown parameter", () => {
		type Service = {
			query(data: unknown, signal: AbortSignal): Promise<string>;
		};
		type Definitions = { readonly query: { readonly cancelable: true } };
		const options: RemoteServiceDescriptorOptions<Service, Definitions> = {
			wireName: "query-service",
			methods: { query: { cancelable: true } },
		};

		expectTypeOf(options.methods).toMatchTypeOf<Definitions>();
		expectTypeOf<{ query: true }>().not.toMatchTypeOf<
			RpcMethodDefinitions<Service>
		>();
		expectTypeOf<RemoteService<Service, Definitions>["query"]>().toEqualTypeOf<
			(data: unknown, signal: AbortSignal | undefined) => Promise<string>
		>();
		expectTypeOf<
			RemoteServiceImplementation<Service, Definitions>["query"]
		>().toEqualTypeOf<Service["query"]>();
	});

	it("RPC-DESC-002: rejects misplaced and duplicate signals around unknown parameters", () => {
		type Service = {
			misplaced(signal: AbortSignal, data: unknown): string;
			duplicate(first: AbortSignal, data: unknown, last: AbortSignal): string;
			beforeRest(signal: AbortSignal, ...data: unknown[]): string;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly misplaced: never;
			readonly duplicate: never;
			readonly beforeRest: never;
		}>();
	});

	it("RPC-DESC-002: requires a fixed final slot of exactly AbortSignal", () => {
		type Service = {
			optional(signal?: AbortSignal): string;
			nullable(signal: AbortSignal | null): string;
			union(signal: AbortSignal | string): string;
			narrow(signal: AbortSignal & { readonly extra: true }): string;
			rest(...signals: AbortSignal[]): string;
			afterRest(...args: [...unknown[], AbortSignal]): string;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly optional: never;
			readonly nullable: never;
			readonly union: never;
			readonly narrow: never;
			readonly rest: never;
			readonly afterRest: never;
		}>();
	});

	it("RPC-DESC-002: accepts cancellation alone or after ordinary parameters", () => {
		type Service = {
			only(signal: AbortSignal): void;
			query(data: string, signal: AbortSignal): number;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly only: { readonly cancelable: true };
			readonly query: { readonly cancelable: true };
		}>();
	});

	it("RPC-DESC-003: preserves unary definitions for zero, optional and rest parameters", () => {
		type Service = {
			empty(): void;
			emptyRest(...args: []): string;
			query(value?: string): Promise<number>;
			collect(...values: unknown[]): number;
		};

		expectTypeOf<RpcMethodDefinitions<Service>>().toEqualTypeOf<{
			readonly empty?: true;
			readonly emptyRest?: true;
			readonly query?: true;
			readonly collect?: true;
		}>();
		expectTypeOf<
			RemoteService<Service, { query: true }>["query"]
		>().toEqualTypeOf<(value?: string) => Promise<number>>();
		expectTypeOf<keyof RemoteService<Service, { query: true }>>().toEqualTypeOf<
			"query" | "then"
		>();
	});

	it("RPC-DESC-003: rejects any parameters and unsupported awaited results", () => {
		type Service = {
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection of an unsafe parameter.
			unsafeParameter(value: any): string;
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection before cancellation classification.
			unsafeCancellation(value: any, signal: AbortSignal): string;
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection of an unsafe return type.
			unsafeResult(): any;
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection after unwrapping a promise.
			unsafePromise(): Promise<any>;
			observable(): Observable<string>;
			iterable(): AsyncIterable<string>;
			promisedStream(): Promise<Observable<string>>;
			mixedResult(): string | AsyncIterable<string>;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly unsafeParameter: never;
			readonly unsafeCancellation: never;
			readonly unsafeResult: never;
			readonly unsafePromise: never;
			readonly observable: never;
			readonly iterable: never;
			readonly promisedStream: never;
			readonly mixedResult: never;
		}>();
	});

	it("RPC-DESC-004: rejects extra cancellation metadata on existing objects", () => {
		type Service = { query(signal: AbortSignal): string };
		type Definitions = { query: { cancelable: true; extra: true } };

		expectTypeOf<Definitions>().not.toMatchTypeOf<
			RemoteServiceDescriptorOptions<Service, Definitions>["methods"]
		>();
	});

	it("RPC-DESC-004: parses method definitions into a detached frozen snapshot", () => {
		const source = {
			wireName: "query-service",
			methods: { query: true, cancel: { cancelable: true } },
		};
		const snapshot = remoteServiceDescriptorOptionsSchema.parse(source);

		expectTypeOf(
			snapshot,
		).toEqualTypeOf<RemoteServiceDescriptorOptionsSnapshot>();
		expectTypeOf(snapshot.methods).toEqualTypeOf<
			Readonly<Record<string, true | { readonly cancelable: true }>>
		>();
		expect(snapshot).toEqual({
			wireName: "query-service",
			methods: { query: true, cancel: { cancelable: true } },
		});
		expect(Object.getPrototypeOf(snapshot.methods)).toBeNull();
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.methods)).toBe(true);
		expect(Object.isFrozen(snapshot.methods.cancel)).toBe(true);

		source.methods.query = false;
		source.methods.cancel.cancelable = false;
		expect(snapshot.methods.query).toBe(true);
		expect(snapshot.methods.cancel).toEqual({ cancelable: true });
	});

	it.each([
		{},
		// biome-ignore lint/suspicious/noThenProperty: verify rejection of the reserved method name.
		{ then: true },
		{ query: false },
		{ query: { cancelable: false } },
		{ query: { cancelable: true, extra: true } },
	])("RPC-DESC-004: rejects invalid method metadata %j", (methods) => {
		expect(
			remoteServiceDescriptorOptionsSchema.safeParse({
				wireName: "query-service",
				methods,
			}).success,
		).toBe(false);
	});

	it("RPC-DESC-005: keeps descriptor service and allowlist parameters invariant", () => {
		type Service = { query(): string };
		type ExtendedService = Service & { extra(): string };
		type Descriptor = RemoteServiceDescriptor<Service, { query: true }>;
		type ExtendedDescriptor = RemoteServiceDescriptor<
			ExtendedService,
			{ query: true }
		>;
		type WidenedDescriptor = RemoteServiceDescriptor<
			Service,
			RpcMethodDefinitions<Service>
		>;

		expectTypeOf<Descriptor>().not.toMatchTypeOf<ExtendedDescriptor>();
		expectTypeOf<ExtendedDescriptor>().not.toMatchTypeOf<Descriptor>();
		expectTypeOf<Descriptor>().not.toMatchTypeOf<WidenedDescriptor>();
		expectTypeOf<WidenedDescriptor>().not.toMatchTypeOf<Descriptor>();
	});

	it("RPC-DESC-006: documents generic correlation loss in facade inference", () => {
		type Service = { identity<T>(value: T): T };

		expectTypeOf<
			RemoteService<Service, { identity: true }>["identity"]
		>().toEqualTypeOf<(value: unknown) => Promise<unknown>>();
	});

	it("RPC-DESC-006: uses the last overload for facade inference and validation", () => {
		type Service = {
			query(value: string): string;
			query(value: number): number;
			stream(value: string): string;
			stream(value: number): Observable<number>;
		};

		expectTypeOf<
			RemoteService<Service, { query: true }>["query"]
		>().toEqualTypeOf<(value: number) => Promise<number>>();
		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly query: true;
			readonly stream: never;
		}>();
	});
});

describe("RPC Topology Owner contract specification", () => {
	it("RPC-CONNECTOR-001: separates binding, graceful drain, synchronous stop and asynchronous cleanup", () => {
		expectTypeOf<IRpcProtocolConnector["bind"]>().toEqualTypeOf<
			(connection: IRpcConnection, signal: AbortSignal) => Promise<void>
		>();
		expectTypeOf<IRpcProtocolConnector["shutdown" | "cleanup"]>().toEqualTypeOf<
			() => Promise<void>
		>();
		expectTypeOf<IRpcProtocolConnector["close"]>().toEqualTypeOf<() => void>();
	});

	it("RPC-CONNECTOR-002: limits Session attachment to lifecycle capabilities and discriminated transitions", () => {
		expectTypeOf<
			IRpcProtocolConnectorLifecycleHost["attachSession"]
		>().toEqualTypeOf<
			(
				session: IRpcProtocolSessionLifecycle,
			) => IRpcProtocolSessionLifecycleHost | undefined
		>();
		expectTypeOf<IRpcProtocolSessionLifecycle["forceClose"]>().toEqualTypeOf<
			() => void
		>();
		expectTypeOf<
			IRpcProtocolSessionLifecycleHost["transition"]
		>().toEqualTypeOf<(transition: RpcProtocolSessionTransition) => void>();
		expectTypeOf<
			| IRpcProtocolConnectorLifecycleHost["fault"]
			| IRpcProtocolSessionLifecycleHost["fault"]
		>().toEqualTypeOf<
			(
				reason:
					| RpcCloseReasonEnum.protocolFault
					| RpcCloseReasonEnum.resourceFault,
				error: Error,
			) => void
		>();
		expectTypeOf<RpcProtocolSessionTransition["type"]>().toEqualTypeOf<
			| RpcProtocolSessionTransitionTypeEnum.draining
			| RpcProtocolSessionTransitionTypeEnum.recovering
			| RpcProtocolSessionTransitionTypeEnum.recovered
			| RpcProtocolSessionTransitionTypeEnum.closed
		>();
		expectTypeOf<
			Extract<
				RpcProtocolSessionTransition,
				{ type: RpcProtocolSessionTransitionTypeEnum.draining }
			>["reason"]
		>().toEqualTypeOf<RpcCloseReasonEnum.counterExhaustion>();
		expectTypeOf<
			Extract<
				RpcProtocolSessionTransition,
				{ type: RpcProtocolSessionTransitionTypeEnum.recovering }
			>["cause"]
		>().toEqualTypeOf<Error | undefined>();
		expectTypeOf<
			keyof Extract<
				RpcProtocolSessionTransition,
				{ type: RpcProtocolSessionTransitionTypeEnum.recovered }
			>
		>().toEqualTypeOf<"type">();
		expectTypeOf<
			Extract<
				RpcProtocolSessionTransition,
				{ type: RpcProtocolSessionTransitionTypeEnum.closed }
			>["reason"]
		>().toEqualTypeOf<
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.remoteTerminated
			| RpcCloseReasonEnum.recoveryExpired
			| RpcCloseReasonEnum.continuityFailure
			| RpcCloseReasonEnum.counterExhaustion
		>();
		expectTypeOf<
			keyof IRpcProtocolSessionLifecycle
		>().toEqualTypeOf<"forceClose">();
		expectTypeOf<keyof IRpcProtocolSessionLifecycleHost>().toEqualTypeOf<
			"transition" | "fault"
		>();
	});

	it("RPC-CONNECTOR-003: keeps provisional attachment distinct from activation and Owner termination", () => {
		expectTypeOf<
			IRpcConnectorSessionLifecycle["peer"]
		>().toEqualTypeOf<IRpcPeer>();
		expectTypeOf<
			IRpcConnectorSessionLifecycle["attached"]
		>().toEqualTypeOf<boolean>();
		expectTypeOf<IRpcConnectorSessionLifecycle["attach"]>().toEqualTypeOf<
			(
				session: IRpcProtocolSessionLifecycle,
			) => IRpcConnectorSessionLifecycleAttachment | undefined
		>();
		expectTypeOf<
			IRpcConnectorSessionLifecycleAttachment["host"]
		>().toEqualTypeOf<IRpcProtocolSessionLifecycleHost>();
		expectTypeOf<
			IRpcConnectorSessionLifecycleAttachment["active"]
		>().toEqualTypeOf<boolean>();
		expectTypeOf<
			IRpcConnectorSessionLifecycleAttachment["activate"]
		>().toEqualTypeOf<(canActivate: () => boolean) => boolean>();
		expectTypeOf<
			| IRpcConnectorSessionLifecycleAttachment["discard"]
			| IRpcConnectorSessionLifecycle["beginGracefulShutdown"]
		>().toEqualTypeOf<() => void>();
		expectTypeOf<IRpcConnectorSessionLifecycle["beginClosing"]>().toEqualTypeOf<
			(reason: RpcOwnerCloseReason, forced: boolean) => void
		>();
		expectTypeOf<RpcOwnerCloseReason>().toEqualTypeOf<
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline
		>();
		expectTypeOf<
			IRpcConnectorSessionLifecycle["protocolFault"]
		>().toEqualTypeOf<IRpcProtocolConnectorLifecycleHost["fault"]>();
		const checkConsumer = (
			lifecycle: IRpcConnectorSessionLifecycle,
			attachment: IRpcConnectorSessionLifecycleAttachment,
			peer: IRpcPeer,
			host: IRpcProtocolSessionLifecycleHost,
		) => {
			// @ts-expect-error The Owner's stable Peer reference cannot be replaced.
			lifecycle.peer = peer;
			// @ts-expect-error Attachment ownership is observed, never set by its consumer.
			lifecycle.attached = false;
			// @ts-expect-error Activation must cross the guarded commit method.
			attachment.active = true;
			// @ts-expect-error The Session-scoped notification host cannot be replaced.
			attachment.host = host;
		};
		expectTypeOf(checkConsumer).returns.toBeVoid();
	});

	it("RPC-CONNECTOR-004: gives a stable Peer a live readonly view of Owner-managed state", () => {
		expectTypeOf<IRpcPeerStateView["readState"]>().toEqualTypeOf<
			() => RpcPeerState
		>();
		expectTypeOf<IRpcPeerStateView["state$"]>().toEqualTypeOf<
			Observable<RpcPeerState>
		>();
		expectTypeOf<keyof IRpcPeerStateView>().toEqualTypeOf<
			"readState" | "state$"
		>();
		const checkConsumer = (view: IRpcPeerStateView, peer: IRpcPeer) => {
			// @ts-expect-error State authority is bound once, without a replacement setter.
			view.readState = () => peer.state;
			// @ts-expect-error The state source identity is bound once.
			view.state$ = peer.state$;
		};
		expectTypeOf(checkConsumer).returns.toBeVoid();
	});

	it("RPC-CONNECTOR-005: keeps lifecycle assembly contracts out of the package root", () => {
		// @ts-expect-error The Protocol role is currently an internal dependency contract.
		expectTypeOf<RemoteRoot.IRpcProtocolConnector>();
		// @ts-expect-error Session attachment remains module-visible only.
		expectTypeOf<RemoteRoot.IRpcProtocolConnectorLifecycleHost>();
		// @ts-expect-error Lifecycle-only Session capabilities are not a public call SPI.
		expectTypeOf<RemoteRoot.IRpcProtocolSessionLifecycle>();
		// @ts-expect-error Session lifecycle notifications are module-visible only.
		expectTypeOf<RemoteRoot.IRpcProtocolSessionLifecycleHost>();
		// @ts-expect-error Internal transition types are not package-root contracts.
		expectTypeOf<RemoteRoot.RpcProtocolSessionTransition>();
		// @ts-expect-error The internal transition enum is not a package-root export.
		expectTypeOf<RemoteRoot.RpcProtocolSessionTransitionTypeEnum>();
		// @ts-expect-error Stable Peer lifecycle ownership is internal assembly.
		expectTypeOf<RemoteRoot.IRpcConnectorSessionLifecycle>();
		// @ts-expect-error Provisional attachments are not a caller-facing API.
		expectTypeOf<RemoteRoot.IRpcConnectorSessionLifecycleAttachment>();
		// @ts-expect-error Owner-selected termination reasons remain module-visible.
		expectTypeOf<RemoteRoot.RpcOwnerCloseReason>();
		// @ts-expect-error The state view is supplied internally, not by package consumers.
		expectTypeOf<RemoteRoot.IRpcPeerStateView>();
		expectTypeOf<
			keyof typeof RemoteRoot
		>().toEqualTypeOf<"createRemoteServiceDescriptor">();
	});

	it("RPC-OWNER-001: preserves Owner state, event and peer surfaces", () => {
		expectTypeOf<IRpcConnector["state"]>().toEqualTypeOf<RpcConnectorState>();
		expectTypeOf<IRpcConnector["state$"]>().toEqualTypeOf<
			Observable<RpcConnectorState>
		>();
		expectTypeOf<IRpcConnector["peer"]>().toEqualTypeOf<IRpcPeer>();
		expectTypeOf<IRpcConnector["event$"]>().toEqualTypeOf<
			Observable<RpcEvent>
		>();
		expectTypeOf<IRpcConnector["connect"]>().toEqualTypeOf<
			(options: RpcConnectorConnectOptions) => Promise<void>
		>();
		expectTypeOf<RpcConnectorConnectOptions>().toEqualTypeOf<{
			readonly adapter: IRpcConnectorAdapter;
			readonly signal?: AbortSignal | undefined;
		}>();
		expectTypeOf<IRpcAcceptor["state"]>().toEqualTypeOf<RpcAcceptorState>();
		expectTypeOf<IRpcAcceptor["state$"]>().toEqualTypeOf<
			Observable<RpcAcceptorState>
		>();
		expectTypeOf<IRpcAcceptor["peers"]>().toEqualTypeOf<readonly IRpcPeer[]>();
		expectTypeOf<IRpcAcceptor["peers$"]>().toEqualTypeOf<
			Observable<readonly IRpcPeer[]>
		>();
		expectTypeOf<IRpcAcceptor["event$"]>().toEqualTypeOf<
			Observable<RpcEvent>
		>();
		expectTypeOf<IRpcAcceptor["listen"]>().toEqualTypeOf<
			(adapter: IRpcAcceptorAdapter) => Promise<void>
		>();
		expectTypeOf<
			IRpcConnector["shutdown" | "close"] | IRpcAcceptor["shutdown" | "close"]
		>().toEqualTypeOf<() => Promise<void>>();
		expectTypeOf<
			Extract<keyof IRpcConnector, "expose" | "resolve">
		>().toBeNever();
	});

	it("RPC-OWNER-002: preserves descriptor inference and rejects incompatible implementations", () => {
		const checkConsumer = (
			acceptor: IRpcAcceptor,
			peer: IRpcPeer,
			descriptor: RemoteServiceDescriptor<
				{
					query(value: string, signal: AbortSignal): number;
				},
				{ query: { cancelable: true } }
			>,
			connector: IRpcConnector,
		) => {
			const implementation = {
				query: (_value: string, _signal: AbortSignal) => 1,
			};
			expectTypeOf(
				acceptor.expose(descriptor, implementation),
			).toEqualTypeOf<Cleanup>();
			expectTypeOf(
				peer.expose(descriptor, implementation),
			).toEqualTypeOf<Cleanup>();
			expectTypeOf(peer.resolve(descriptor).query).toEqualTypeOf<
				(value: string, signal: AbortSignal | undefined) => Promise<number>
			>();
			// @ts-expect-error Implementation inference must not widen the descriptor result.
			acceptor.expose(descriptor, { query: () => "wrong result" });
			// @ts-expect-error Implementation inference must not widen the descriptor parameter.
			peer.expose(descriptor, { query: (_value: number) => 1 });
			// @ts-expect-error Owner peer references are readonly.
			connector.peer = peer;
			// @ts-expect-error Acceptor peer collections are readonly.
			acceptor.peers.push(peer);
		};
		expectTypeOf(checkConsumer).returns.toBeVoid();
	});

	it("RPC-OWNER-003: keeps lifecycle and closed-state outcomes discriminated", () => {
		expectTypeOf<RpcConnectorState["status"]>().toEqualTypeOf<
			| RpcStateStatusEnum.active
			| RpcStateStatusEnum.draining
			| RpcStateStatusEnum.closing
			| RpcStateStatusEnum.closed
		>();
		expectTypeOf<RpcAcceptorState["status"]>().toEqualTypeOf<
			RpcConnectorState["status"]
		>();
		expectTypeOf<
			Extract<
				RpcAcceptorState,
				{ status: RpcStateStatusEnum.active }
			>["listener"]
		>().toEqualTypeOf<RpcAcceptorListenerState>();
		expectTypeOf<
			Extract<
				RpcAcceptorState,
				{ listener: RpcAcceptorListenerState }
			>["status"]
		>().toEqualTypeOf<RpcStateStatusEnum.active>();
		expectTypeOf<
			Extract<
				RpcAcceptorListenerState,
				{ outcome: RpcCloseOutcomeEnum.failed }
			>["error"]
		>().toEqualTypeOf<Error>();
		expectTypeOf<
			Extract<RpcPeerState, { status: RpcStateStatusEnum.recovering }>
		>().not.toBeNever();
		expectTypeOf<
			Extract<
				RpcConnectorState,
				{
					reason:
						| RpcCloseReasonEnum.recoveryExpired
						| RpcCloseReasonEnum.counterExhaustion;
				}
			>["error"]["code"]
		>().toEqualTypeOf<RpcExceptionCodeEnum.unavailable>();
		expectTypeOf<
			Extract<
				RpcConnectorState,
				{
					reason:
						| RpcCloseReasonEnum.continuityFailure
						| RpcCloseReasonEnum.protocolFault
						| RpcCloseReasonEnum.resourceFault;
				}
			>["error"]["code"]
		>().toEqualTypeOf<RpcExceptionCodeEnum.protocol>();
		expectTypeOf<
			Extract<
				RpcAcceptorState,
				{ reason: RpcCloseReasonEnum.cleanupFailed }
			>["error"]
		>().toEqualTypeOf<Error>();
		expectTypeOf<
			Extract<
				"error",
				keyof Extract<RpcPeerState, { outcome: RpcCloseOutcomeEnum.normal }>
			>
		>().toBeNever();
	});

	it("RPC-OWNER-003: preserves safe exception messages, codes and causes", () => {
		const cause = new Error("private transport detail");
		const error = new RpcException(RpcExceptionCodeEnum.unavailable, cause);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("RpcException");
		expect(error.message).toBe("unavailable: RPC failed.");
		expect(error.code).toBe(RpcExceptionCodeEnum.unavailable);
		expect(error.cause).toBe(cause);
	});

	it("RPC-OWNER-004: preserves safe call metadata and outcome narrowing", () => {
		type Finished = Extract<RpcEvent, { type: RpcEventTypeEnum.callFinished }>;
		type UnknownService = Extract<
			Finished,
			{
				code: RpcExceptionCodeEnum.unknownService;
				direction: RpcCallDirectionEnum.incoming;
			}
		>;
		type UnknownMethod = Extract<
			Finished,
			{
				code: RpcExceptionCodeEnum.unknownMethod;
				direction: RpcCallDirectionEnum.incoming;
			}
		>;
		expectTypeOf<Finished["observationId"]>().toEqualTypeOf<string>();
		expectTypeOf<Finished["peer"]>().toEqualTypeOf<IRpcPeer>();
		expectTypeOf<
			UnknownService["service" | "method"]
		>().toEqualTypeOf<undefined>();
		expectTypeOf<UnknownMethod["service"]>().toEqualTypeOf<string>();
		expectTypeOf<UnknownMethod["method"]>().toEqualTypeOf<undefined>();
		expectTypeOf<
			Extract<
				Finished,
				{
					direction: RpcCallDirectionEnum.incoming;
					service: string;
					method: string;
					outcome: RpcCallStatusEnum.rejected;
				}
			>["code"]
		>().toEqualTypeOf<
			RpcExceptionCodeEnum.canceled | RpcExceptionCodeEnum.handlerFailed
		>();
		expectTypeOf<
			Extract<
				Finished,
				{
					direction: RpcCallDirectionEnum.outgoing;
					outcome: RpcCallStatusEnum.rejected;
				}
			>["code"]
		>().toEqualTypeOf<
			Exclude<RpcExceptionCodeEnum, RpcExceptionCodeEnum.protocol>
		>();
		type SensitiveEvent = RpcEvent extends infer Event
			? Event extends RpcEvent
				? Extract<keyof Event, "args" | "value" | "payload" | "error" | "cause">
				: never
			: never;
		expectTypeOf<SensitiveEvent>().toBeNever();
	});

	it("RPC-OWNER-005: preserves Adapter roles and byte Connection signatures", () => {
		expectTypeOf<
			IRpcConnectorAdapter["connection$"] | IRpcAcceptorAdapter["connection$"]
		>().toEqualTypeOf<Observable<IRpcConnection>>();
		expectTypeOf<
			IRpcConnectorAdapter["connect"] | IRpcAcceptorAdapter["listen"]
		>().toEqualTypeOf<(signal: AbortSignal) => Promise<void>>();
		expectTypeOf<IRpcConnection["message$"]>().toEqualTypeOf<
			Observable<Uint8Array>
		>();
		expectTypeOf<IRpcConnection["send"]>().toEqualTypeOf<
			(message: Uint8Array) => Promise<void>
		>();
		expectTypeOf<IRpcConnection["close"]>().toEqualTypeOf<
			() => Promise<void>
		>();
	});
});
