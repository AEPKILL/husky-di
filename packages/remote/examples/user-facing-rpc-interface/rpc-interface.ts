/**
 * @overview @husky-di/remote throwaway prototype for the production caller Interface.
 *
 * This file models the proposed public package surface. It intentionally leaves the
 * Protocol implementation seam opaque for the dedicated Protocol decision ticket.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { Cleanup, IDisposable, ServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";

// ── Remote Service Descriptor ────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: method extraction must preserve arbitrary parameter variance.
type AnyMethod = (...args: any[]) => unknown;

type IsAny<T> = 0 extends 1 & T ? true : false;

type ContainsAbortSignal<T> =
	IsAny<T> extends true
		? false
		: [Extract<T, AbortSignal>] extends [never]
			? false
			: true;

type ParametersContainAbortSignal<F extends AnyMethod> = ContainsAbortSignal<
	Parameters<F>[number]
>;

type IsNever<T> = [T] extends [never] ? true : false;

type HasNoParameters<F extends AnyMethod> =
	Parameters<F> extends []
		? true
		: IsNever<Parameters<F>[number]> extends true
			? true
			: false;

type HasValidCancellationSlot<F extends AnyMethod> =
	Parameters<F> extends [...infer Head, infer Last]
		? IsAny<Last> extends true
			? false
			: [Last] extends [AbortSignal]
				? [AbortSignal] extends [Last]
					? ContainsAbortSignal<Head[number]> extends false
						? true
						: false
					: false
				: false
		: false;

export type RemoteMethodKey<T> = {
	[K in keyof T]-?: K extends string
		? T[K] extends AnyMethod
			? K
			: never
		: never;
}[keyof T];

/**
 * v1 selected methods are unary by definition. A cancelable local handler must
 * reserve exactly one required trailing AbortSignal; the remote proxy makes it optional.
 */
export type RpcUnaryMethodDefinition<F extends AnyMethod = AnyMethod> = (IsAny<
	Awaited<ReturnType<F>>
> extends true
	? unknown
	: Extract<Awaited<ReturnType<F>>, Observable<unknown>> extends never
		? unknown
		: never) &
	(HasNoParameters<F> extends true
		? true
		: ParametersContainAbortSignal<F> extends false
			? true
			: HasValidCancellationSlot<F> extends true
				? { readonly cancelable: true }
				: never);

export type RpcMethodDefinitions<T> = Partial<{
	readonly [K in RemoteMethodKey<T>]: RpcUnaryMethodDefinition<
		Extract<T[K], AnyMethod>
	>;
}>;

type ValidateMethodDefinition<F extends AnyMethod, Definition> =
	Definition extends RpcUnaryMethodDefinition<F>
		? Definition extends true
			? Definition
			: Definition extends { readonly cancelable: true }
				? Exclude<keyof Definition, "cancelable"> extends never
					? HasValidCancellationSlot<F> extends true
						? Definition
						: never
					: never
				: never
		: never;

type ValidateMethodDefinitions<T, Definitions extends object> = {
	readonly [K in keyof Definitions]: K extends RemoteMethodKey<T>
		? ValidateMethodDefinition<Extract<T[K], AnyMethod>, Definitions[K]>
		: never;
};

type RequiredKey<T> = {
	[K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

type SelectedMethodKey<Definitions> = Extract<RequiredKey<Definitions>, string>;

type IsCancelableMethod<Definition> = Definition extends {
	readonly cancelable: true;
}
	? true
	: false;

type RemoteMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Args extends [...infer Params, AbortSignal]
			? (...args: [...Params, signal?: AbortSignal]) => Promise<Awaited<Result>>
			: never
		: (...args: Args) => Promise<Awaited<Result>>
	: never;

export type RemoteService<T, Definitions extends RpcMethodDefinitions<T>> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
};

declare const remoteServiceDescriptorBrand: unique symbol;

/** Opaque runtime descriptor shared by both RPC peers. */
export interface IRemoteServiceDescriptor<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> {
	readonly [remoteServiceDescriptorBrand]: {
		readonly service: T;
		readonly definitions: Definitions;
	};
}

export declare function createRemoteServiceDescriptor<
	T,
	const Definitions extends RpcMethodDefinitions<T>,
>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: {
		/** Required cross-language identity; never inferred from a class, string, or symbol. */
		readonly wireName: string;
		readonly methods: Definitions & ValidateMethodDefinitions<T, Definitions>;
	},
): IRemoteServiceDescriptor<T, Definitions>;

// ── Remote results and errors ────────────────────────────────────────────

export enum RpcErrorCodeEnum {
	unavailable = "unavailable",
	interrupted = "interrupted",
	canceled = "canceled",
	remote = "remote",
	unknownService = "unknown-service",
	unknownMethod = "unknown-method",
	disposed = "disposed",
	protocol = "protocol",
}

export interface IRpcRemoteError {
	readonly name: string;
	readonly message: string;
}

export declare class RpcError extends Error {
	private constructor();

	readonly code: RpcErrorCodeEnum;
	readonly remote?: IRpcRemoteError;
}

export type RpcPeerResult<T> =
	| {
			readonly peer: IRpcPeer;
			readonly status: "fulfilled";
			readonly value: T;
	  }
	| {
			readonly peer: IRpcPeer;
			readonly status: "rejected";
			readonly reason: RpcError;
	  };

type RemoteGroupMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Args extends [...infer Params, AbortSignal]
			? (
					...args: [...Params, signal?: AbortSignal]
				) => Promise<readonly RpcPeerResult<Awaited<Result>>[]>
			: never
		: (...args: Args) => Promise<readonly RpcPeerResult<Awaited<Result>>[]>
	: never;

export type RemoteServiceGroup<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteGroupMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
};

// ── Read-only observations ───────────────────────────────────────────────

export type RpcCallDirection = "incoming" | "outgoing";

export type RpcEvent =
	| {
			readonly type: "topology-closed";
			readonly outcome: "closed";
	  }
	| {
			readonly type: "topology-closed";
			readonly outcome: "failed";
			readonly error: RpcError;
	  }
	| {
			readonly type: "peer-opened";
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: "peer-recovering";
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: "peer-recovered";
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: "peer-closed";
			readonly peer: IRpcPeer;
			readonly outcome: "closed";
	  }
	| {
			readonly type: "peer-closed";
			readonly peer: IRpcPeer;
			readonly outcome: "failed";
			readonly error: RpcError;
	  }
	| {
			readonly type: "call-started";
			/** Local observation identity; never the default Protocol's wire call identity. */
			readonly observationId: string;
			readonly peer: IRpcPeer;
			readonly direction: RpcCallDirection;
			readonly service: string;
			readonly method: string;
			/**
			 * Detached local observation snapshot excluding caller and injected cancellation
			 * signals. Values are unredacted but share no mutable application objects.
			 */
			readonly args: readonly unknown[];
	  }
	| {
			readonly type: "call-finished";
			readonly observationId: string;
			readonly peer: IRpcPeer;
			readonly direction: RpcCallDirection;
			readonly service: string;
			readonly method: string;
			/** See call-started args; repeated so this hot event is self-contained. */
			readonly args: readonly unknown[];
			readonly outcome: "fulfilled";
			/** Detached, unredacted local observation snapshot of the fulfilled result. */
			readonly result: unknown;
	  }
	| {
			readonly type: "call-finished";
			readonly observationId: string;
			readonly peer: IRpcPeer;
			readonly direction: RpcCallDirection;
			readonly service: string;
			readonly method: string;
			/** See call-started args; repeated so this hot event is self-contained. */
			readonly args: readonly unknown[];
			readonly outcome: "rejected";
			readonly error: RpcError;
	  };

// ── Transport Adapter seam ──────────────────────────────────────────────

/** A finite-lived, ordered, full-duplex Physical Connection. */
export interface IRpcConnection {
	/**
	 * Complete encoded Protocol messages in transport order. The source is hot,
	 * multicast, and has no replay. Subscriptions observe; they never own the connection.
	 * All subscribers see the same message value and must not mutate its bytes.
	 * A normal Physical Connection terminal completes the stream; a failure errors it.
	 */
	readonly message$: Observable<Uint8Array>;

	/** Resolves after local copy/admission, not remote delivery, decode, or ACK. */
	send(message: Uint8Array): Promise<void>;

	/** Idempotent graceful close; calling it immediately rejects later send attempts. */
	close(): Promise<void>;
}

export interface IRpcConnectorAdapter {
	/**
	 * Creates exactly one Physical Connection. The caller owns the Adapter and decides
	 * when and which Adapter to use; Connection ownership transfers on fulfillment.
	 */
	connect(signal: AbortSignal): Promise<IRpcConnection>;
}

export interface IRpcAcceptorAdapter extends IDisposable {
	/**
	 * Accepted Physical Connections. The source is hot, multicast, and has no replay.
	 * Each accepted Connection is emitted once by the source; every subscriber observes
	 * the same object identity. Subscribing neither grants nor releases authority.
	 * Passing this Adapter to IRpcAcceptor.listen makes that Acceptor the owner of every
	 * subsequently emitted Connection, including emissions before startup completes.
	 * Calling send or close without owner authority violates this Interface.
	 * The source must not emit before listen is invoked.
	 * Normal listener termination completes the stream; listener failure errors it.
	 */
	readonly connection$: Observable<IRpcConnection>;

	/** Topology-owner port that resolves when listening is ready. */
	listen(signal: AbortSignal): Promise<void>;
}

// ── Caller-facing deep Modules ──────────────────────────────────────────

export interface IRpcPeer {
	/**
	 * Exposes a borrowed implementation for this Logical Session. The exposure lives
	 * until Cleanup or peer termination. A duplicate Wire Service Name throws without
	 * changing the registry. Cleanup affects future dispatch only; an in-flight call keeps
	 * the implementation captured when it was dispatched.
	 */
	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceDescriptor<T, Definitions>,
		implementation: T,
	): Cleanup;

	/** Returns a stable proxy whose calls survive transparent Session Recovery. */
	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions>;
}

interface IRpcTopologyOwner {
	/**
	 * Lifecycle and call observations. The stream is hot, multicast, and without
	 * replay; subscribe/unsubscribe never starts, stops, or otherwise owns RPC resources.
	 * It emits exactly one topology-closed event before completion and never errors.
	 */
	readonly event$: Observable<RpcEvent>;

	/** Idempotently closes every resource owned by this Topology Owner. */
	close(): Promise<void>;
}

export interface IRpcConnector extends IRpcTopologyOwner {
	/** Stable from factory return through every Physical Connection replacement. */
	readonly peer: IRpcPeer;

	/**
	 * Attaches one Adapter-created Physical Connection to the stable Logical Session.
	 * The Connector owns only the fulfilled Connection, never the Adapter. A rejected
	 * attempt does not choose a future Adapter or end the retained Session; the caller
	 * may retry with another Adapter while the later recovery ticket defines time bounds.
	 */
	connect(adapter: IRpcConnectorAdapter): Promise<void>;
}

export interface IRpcAcceptor extends IRpcTopologyOwner {
	/**
	 * A fresh readonly snapshot of all retained Logical Peers. Membership changes before
	 * the matching event$ next notification, so subscribe-then-read plus stable identity
	 * and deduplication provides a race-free bootstrap.
	 */
	readonly peers: readonly IRpcPeer[];

	/**
	 * Atomically exposes one borrowed implementation to every current and future peer.
	 * Duplicate Wire Service Names reject without partial registration; Cleanup removes
	 * this registration from the owner scope and every retained peer.
	 */
	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceDescriptor<T, Definitions>,
		implementation: T,
	): Cleanup;

	/**
	 * Starts the passive topology and takes ownership of the Acceptor Adapter when called.
	 * It subscribes to Adapter connections before starting the listener. Synchronous
	 * validation failure and rejected startup must release that Adapter.
	 */
	listen(adapter: IRpcAcceptorAdapter): Promise<void>;

	/**
	 * Returns a stable Remote Service Group. Every remote method invocation captures a
	 * fresh peer snapshot and associates each result with its stable peer.
	 */
	resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteServiceGroup<T, Definitions>;
}

declare const rpcProtocolBrand: unique symbol;

/**
 * Opaque caller-side Protocol handle. Its implementation Interface is deliberately
 * deferred to the dedicated Protocol Module seam ticket.
 */
export interface IRpcProtocol {
	readonly [rpcProtocolBrand]: never;
}

/** The package's one built-in Protocol, used implicitly unless another is injected. */
export declare const defaultRpcProtocol: IRpcProtocol;

export interface RpcTopologyOptions {
	readonly protocol?: IRpcProtocol;
}

export declare function createRpcConnector(
	options?: RpcTopologyOptions,
): IRpcConnector;

export declare function createRpcAcceptor(
	options?: RpcTopologyOptions,
): IRpcAcceptor;
