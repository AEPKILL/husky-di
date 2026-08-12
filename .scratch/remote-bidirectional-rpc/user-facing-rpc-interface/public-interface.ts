/**
 * @overview PROTOTYPE ONLY — shared declarations for RPC interface comparison.
 *
 * This file is a throwaway discussion asset for
 * "验证面向用户的 RPC 接口". It is not a package proposal and must not be
 * exported from @husky-di/remote. Usage examples live beside this file as
 * separate *.usage.ts modules.
 *
 * Evidence: ../research/user-facing-rpc-interface-ergonomics.md
 *
 * @author AEPKILL
 * @created 2026-08-12 21:34:00
 */

// Stand-ins for existing @husky-di/core declarations keep this prototype a
// single independently type-checkable file.
export type Cleanup = () => void;

export interface IDisposable {
	readonly disposed: boolean;
	dispose(): void;
}

export type ServiceIdentifier<T> =
	| (abstract new (
			...args: never[]
	  ) => T)
	| (new (
			...args: never[]
	  ) => T)
	| string
	| symbol;

export declare function createServiceIdentifier<T>(
	id: string | symbol,
): ServiceIdentifier<T>;

// biome-ignore lint/suspicious/noExplicitAny: Method-key extraction must accept every parameter list without constraining variance.
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

export type RpcUnaryMethodDefinition<F extends AnyMethod = AnyMethod> =
	| (HasNoParameters<F> extends true
			? true | { readonly type: "unary"; readonly cancelable: false }
			: ParametersContainAbortSignal<F> extends false
				? true | { readonly type: "unary"; readonly cancelable: false }
				: never)
	| (HasValidCancellationSlot<F> extends true
			? {
					readonly type: "unary";
					readonly cancelable: true;
				}
			: never);

export type RpcMethodDefinitions<T> = Partial<{
	readonly [K in RemoteMethodKey<T>]: RpcUnaryMethodDefinition<
		Extract<T[K], AnyMethod>
	>;
}>;

type ValidateMethodDefinition<
	F extends AnyMethod,
	Definition,
> = Definition extends true
	? HasNoParameters<F> extends true
		? Definition
		: ParametersContainAbortSignal<F> extends false
			? Definition
			: never
	: Definition extends { readonly type: "unary" }
		? Exclude<keyof Definition, "type" | "cancelable"> extends never
			? Definition extends { readonly cancelable: true }
				? HasValidCancellationSlot<F> extends true
					? Definition
					: never
				: Definition extends { readonly cancelable: false }
					? HasNoParameters<F> extends true
						? Definition
						: ParametersContainAbortSignal<F> extends false
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

type SelectedMethodKey<Definitions> = Extract<keyof Definitions, string>;

type IsCancelableMethod<Definition> = Definition extends {
	readonly cancelable: true;
}
	? true
	: false;

type NormalizedRpcMethodDefinition<Definition> = Definition extends true
	? { readonly type: "unary"; readonly cancelable: false }
	: Definition;

type NormalizedRpcMethodDefinitions<Definitions> = Readonly<{
	[K in keyof Definitions]: NormalizedRpcMethodDefinition<Definitions[K]>;
}>;

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

export enum RpcBatchResultStatusEnum {
	fulfilled = "fulfilled",
	rejected = "rejected",
}

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

export interface RemoteError {
	readonly name: string;
	readonly message: string;
}

export declare class RpcError extends Error {
	readonly code: RpcErrorCodeEnum;
	readonly remote?: RemoteError;
}

/**
 * One finite-lived, full-duplex Physical Connection.
 *
 * Each `frames` item is exactly one complete encoded RPC frame. A message
 * transport can preserve its native boundary; a byte-stream adapter must add
 * and remove framing. The RPC implementation owns frame contents and codec.
 */
export interface IPhysicalConnection extends IDisposable {
	/**
	 * Single-consumer receive stream in transport order. Normal remote shutdown
	 * ends iteration; transport failure throws from the iterator.
	 *
	 * Yielding a frame transfers a stable buffer to the RPC implementation; the
	 * adapter must never mutate or reuse it. A push-only transport must use a
	 * bounded queue when it cannot pause its source. Overflow is a connection
	 * failure that throws from this iterator, never permission to grow without
	 * bound.
	 */
	readonly frames: AsyncIterable<Uint8Array>;

	/**
	 * Sends one complete frame.
	 *
	 * Fulfillment means the adapter has copied/consumed the caller's bytes and
	 * admitted the frame through its local backpressure mechanism. It does not
	 * mean the peer received, decoded or acknowledged the frame.
	 *
	 * The RPC implementation awaits sends sequentially, so adapters need not
	 * define ordering for concurrent calls.
	 */
	send(frame: Uint8Array): Promise<void>;

	/**
	 * Gracefully finishes outbound transport after earlier sends. Later sends
	 * reject. A transport without half-close may close both directions.
	 *
	 * This is deliberately distinct from synchronous `dispose()`, which aborts
	 * pending I/O and need not flush.
	 */
	end(): Promise<void>;
}

/** Active topology port. Each call creates a fresh Physical Connection. */
export interface IRpcConnectorAdapter {
	/**
	 * May be called again after loss to provide a replacement connection.
	 * Abort rejects the pending attempt; configuration errors belong in the
	 * concrete adapter factory and throw before this method is reached.
	 */
	connect(signal: AbortSignal): Promise<IPhysicalConnection>;
}

/** A live passive listener returned only after the endpoint is ready. */
export interface IPhysicalConnectionListener extends IDisposable {
	/** Resolves after normal disposal; rejects on a later listener failure. */
	readonly closed: Promise<void>;
}

/** Passive topology port. */
export interface IRpcAcceptorAdapter {
	/**
	 * Starts listening and transfers ownership of every accepted connection to
	 * `accept`. The returned listener owns only the adapter's subscription or
	 * listening resource, never an externally supplied HTTP server.
	 *
	 * The promise fulfills only when listening is ready; `accept` is not called
	 * before fulfillment. Initial failure rejects this promise. A later listener
	 * failure rejects `listener.closed`. The signal only covers startup: after
	 * this promise settles the adapter stops observing it, and the returned
	 * listener alone controls the live endpoint.
	 *
	 * The RPC-supplied `accept` never throws and takes ownership synchronously.
	 * The adapter must not invoke it after listener disposal or closure.
	 */
	listen(
		accept: (connection: IPhysicalConnection) => void,
		signal: AbortSignal,
	): Promise<IPhysicalConnectionListener>;
}

export interface MemoryRpcAdapterPair {
	readonly connectorAdapter: IRpcConnectorAdapter;
	readonly acceptorAdapter: IRpcAcceptorAdapter;
}

/**
 * Concrete test adapter using the same public seam as production adapters.
 * TransformStream writer promises make local backpressure observable instead
 * of hiding an unbounded queue in the prototype.
 */
export function createMemoryRpcAdapterPair(): MemoryRpcAdapterPair {
	let acceptConnection: ((connection: IPhysicalConnection) => void) | undefined;

	return {
		connectorAdapter: {
			async connect(signal) {
				signal.throwIfAborted();

				if (!acceptConnection) {
					throw new Error("The in-memory RPC acceptor is not listening");
				}

				const [connectorConnection, acceptorConnection] =
					createMemoryPhysicalConnectionPair();

				if (signal.aborted) {
					connectorConnection.dispose();
					acceptorConnection.dispose();
					signal.throwIfAborted();
				}

				acceptConnection(acceptorConnection);

				return connectorConnection;
			},
		},
		acceptorAdapter: {
			async listen(accept, signal) {
				signal.throwIfAborted();

				if (acceptConnection) {
					throw new Error("The in-memory RPC acceptor is already listening");
				}

				let disposed = false;
				let resolveClosed: (() => void) | undefined;
				const closed = new Promise<void>((resolve) => {
					resolveClosed = resolve;
				});
				const listener: IPhysicalConnectionListener = {
					get disposed() {
						return disposed;
					},
					closed,
					dispose() {
						if (disposed) {
							return;
						}

						disposed = true;
						acceptConnection = undefined;
						resolveClosed?.();
					},
				};

				acceptConnection = accept;
				if (signal.aborted) {
					listener.dispose();
					signal.throwIfAborted();
				}
				return listener;
			},
		},
	};
}

class MemoryPhysicalConnection implements IPhysicalConnection {
	public readonly frames: AsyncIterable<Uint8Array>;
	private readonly _reader: ReadableStreamDefaultReader<Uint8Array>;
	private readonly _writer: WritableStreamDefaultWriter<Uint8Array>;
	private _disposed = false;
	private _framesTaken = false;
	private _writeEnded = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	public constructor(
		readable: ReadableStream<Uint8Array>,
		writable: WritableStream<Uint8Array>,
	) {
		this._reader = readable.getReader();
		this._writer = writable.getWriter();
		this.frames = {
			[Symbol.asyncIterator]: () => {
				if (this._framesTaken) {
					throw new TypeError("Physical Connection frames are single-consumer");
				}

				this._framesTaken = true;
				return this._readFrames();
			},
		};
	}

	public async send(frame: Uint8Array): Promise<void> {
		if (this._disposed) {
			throw new Error("The in-memory Physical Connection is disposed");
		}
		if (this._writeEnded) {
			throw new Error("The in-memory Physical Connection has ended its writes");
		}

		// Copy before awaiting so the caller may reuse its buffer immediately.
		await this._writer.write(frame.slice());
	}

	public async end(): Promise<void> {
		if (this._disposed) {
			throw new Error("The in-memory Physical Connection is disposed");
		}
		if (this._writeEnded) {
			return;
		}

		this._writeEnded = true;
		await this._writer.close();
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		void this._reader.cancel().catch(() => undefined);
		void this._writer.abort().catch(() => undefined);
	}

	private async *_readFrames(): AsyncIterableIterator<Uint8Array> {
		while (!this._disposed) {
			const result = await this._reader.read();
			if (result.done) {
				return;
			}

			yield result.value;
		}
	}
}

function createMemoryPhysicalConnectionPair(): readonly [
	IPhysicalConnection,
	IPhysicalConnection,
] {
	const connectorToAcceptor = new TransformStream<Uint8Array, Uint8Array>();
	const acceptorToConnector = new TransformStream<Uint8Array, Uint8Array>();

	return [
		new MemoryPhysicalConnection(
			acceptorToConnector.readable,
			connectorToAcceptor.writable,
		),
		new MemoryPhysicalConnection(
			connectorToAcceptor.readable,
			acceptorToConnector.writable,
		),
	];
}

/**
 * ADAPTER DESIGN ALTERNATIVES
 *
 * These three exact seams expose the complexity that the first prototype hid.
 * The root/contract/functional drafts below currently use the framed-pull seam
 * above; choosing the transport unit and consumption model remains HITL.
 */
export namespace AdapterAlternatives {
	/**
	 * Alternative 1 — raw byte chunks + AsyncIterable.
	 *
	 * Framing belongs to the RPC implementation. This maps naturally to TCP, but
	 * discards WebSocket/MessagePort boundaries. The common framed-pull candidate
	 * now also keeps graceful `end()` distinct from abortive `dispose()`.
	 */
	export namespace RawByteStream {
		export interface IPhysicalConnection extends IDisposable {
			/** Ordered chunks; chunk boundaries carry no protocol meaning. */
			readonly bytes: AsyncIterable<Uint8Array>;

			/** Local admission/backpressure only, never delivery or ACK. */
			write(bytes: Uint8Array): Promise<void>;

			/** Gracefully finishes the write side after earlier writes. */
			end(): Promise<void>;
		}

		export interface IRpcConnectorAdapter {
			connect(signal: AbortSignal): Promise<IPhysicalConnection>;
		}

		export interface IRpcAcceptorAdapter {
			/** Fulfills when ready; iteration throws on later listener failure. */
			listen(signal: AbortSignal): Promise<AsyncIterable<IPhysicalConnection>>;
		}
	}

	/**
	 * Alternative 2 — Web Platform streams end to end.
	 *
	 * Backpressure, graceful close, cancellation and stream errors are
	 * standardized, but adapter authors must construct stream controllers
	 * correctly and RPC code must lock readers/writers. Chunk boundaries still
	 * carry no protocol meaning.
	 */
	export namespace WebStreams {
		export interface IPhysicalConnection extends IDisposable {
			readonly readable: ReadableStream<Uint8Array>;
			readonly writable: WritableStream<Uint8Array>;
		}

		export interface IRpcConnectorAdapter {
			connect(signal: AbortSignal): Promise<IPhysicalConnection>;
		}

		export interface IRpcAcceptorAdapter {
			/** Fulfills when ready; stream error reports later listener failure. */
			listen(signal: AbortSignal): Promise<ReadableStream<IPhysicalConnection>>;
		}
	}

	/**
	 * Alternative 3 — complete messages + callbacks.
	 *
	 * This closely maps WebSocket and MessagePort. A raw byte transport must add
	 * framing in its adapter. Inbound callbacks have no portable demand signal,
	 * so the adapter must bound pre-attach and runtime buffering itself.
	 */
	export namespace MessageCallbacks {
		export interface PhysicalConnectionEvents {
			message(frame: Uint8Array): void;
			close(): void;
			error(cause: unknown): void;
		}

		export interface IPhysicalConnection extends IDisposable {
			/** Installs the sole sink exactly once and starts inbound delivery. */
			attach(events: PhysicalConnectionEvents): void;

			/** Local admission/backpressure only, never delivery or ACK. */
			send(frame: Uint8Array): Promise<void>;
		}

		export interface IRpcConnectorAdapter {
			connect(signal: AbortSignal): Promise<IPhysicalConnection>;
		}

		export interface AcceptorEvents {
			connection(connection: IPhysicalConnection): void;
			error(cause: unknown): void;
		}

		export interface IRpcAcceptorAdapter extends IDisposable {
			/** Fulfills when ready; later failure calls events.error exactly once. */
			listen(events: AcceptorEvents, signal: AbortSignal): Promise<void>;
		}
	}
}

// The result keeps the peer handle, not merely its array index. A caller can
// correlate it with the exact object from Acceptor.peers even if peers change
// while the batch is in flight.
export type RpcPeerResult<Peer, T> =
	| {
			readonly peer: Peer;
			readonly status: RpcBatchResultStatusEnum.fulfilled;
			readonly value: T;
	  }
	| {
			readonly peer: Peer;
			readonly status: RpcBatchResultStatusEnum.rejected;
			readonly reason: RpcError;
	  };

type RemoteGroupMethod<Peer, F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Args extends [...infer Params, AbortSignal]
			? (
					...args: [...Params, signal?: AbortSignal]
				) => Promise<readonly RpcPeerResult<Peer, Awaited<Result>>[]>
			: never
		: (
				...args: Args
			) => Promise<readonly RpcPeerResult<Peer, Awaited<Result>>[]>
	: never;

export type RemoteServiceGroup<
	Peer,
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteGroupMethod<Peer, Extract<T[K], AnyMethod>, Definitions[K]>;
};

/**
 * DRAFT A — ROOT-CENTERED
 *
 * Mental model: one local RPC root owns shared exposure and every topology it
 * creates. Connector owns one stable Logical Session peer; Acceptor owns all
 * accepted peers. This is the recommended baseline because it hides the most
 * session/registry machinery behind the fewest concepts.
 */
export namespace RootCentered {
	export interface IRemoteServiceIdentifier<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	> {
		readonly serviceIdentifier: ServiceIdentifier<T>;
		readonly wireName: string;
		// Runtime canonical form normalizes every `true` entry to
		// `{ type: "unary", cancelable: false }` and freezes the result.
		readonly methods: NormalizedRpcMethodDefinitions<Definitions>;
	}

	export declare function createRemoteServiceIdentifier<
		T,
		const Definitions extends RpcMethodDefinitions<T>,
	>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: {
			readonly wireName?: string;
			readonly methods: Definitions & ValidateMethodDefinitions<T, Definitions>;
		},
	): IRemoteServiceIdentifier<T, Definitions>;

	export interface IRpcPeer {
		// Safe before a Physical Connection exists. Calls, not proxy creation,
		// perform I/O. The same proxy remains usable after transient reconnect.
		resolve<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
		): RemoteService<T, Definitions>;
	}

	export interface IConnector extends IDisposable {
		// Identity is fixed as soon as the Connector is created.
		readonly peer: IRpcPeer;

		// Establishes the initial Physical Connection. Once it succeeds, the
		// implementation may restore that Logical Session after transient loss.
		connect(): Promise<void>;
	}

	export interface IAcceptor extends IDisposable {
		// A fresh, ordinary readonly array snapshot on every read.
		readonly peers: readonly IRpcPeer[];

		// Subscribe before listen() when every newly accepted Logical Session
		// must receive a server-initiated call. Cleanup removes this listener.
		onPeer(listener: (peer: IRpcPeer) => void): Cleanup;

		// Fulfills when the adapter is ready to accept Physical Connections.
		listen(): Promise<void>;

		// The returned group is stable. Each method call snapshots peers at that
		// instant, invokes them concurrently, and returns results in snapshot order.
		resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
		): RemoteServiceGroup<IRpcPeer, T, Definitions>;
	}

	// The adapter-author interface is deliberately part of this prototype.
	export type RpcConnectorAdapter = IRpcConnectorAdapter;
	export type RpcAcceptorAdapter = IRpcAcceptorAdapter;

	export interface IRpc extends IDisposable {
		// The RPC root borrows the implementation. Cleanup removes only this
		// exposure; neither cleanup nor root disposal disposes the implementation.
		expose<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
			implementation: T,
		): Cleanup;

		// These members only select active/passive topology. They intentionally
		// do not duplicate expose() or remote-service resolution.
		connector(adapter: RpcConnectorAdapter): IConnector;
		acceptor(adapter: RpcAcceptorAdapter): IAcceptor;
	}

	export declare function createRpc(): IRpc;
}

/**
 * DRAFT B — CONTRACT-CENTERED
 *
 * Mental model: a RemoteContract owns all discoverable operations for one
 * service. A separate Services catalog owns exposure; Connector/Acceptor
 * borrow that catalog. This maximizes per-service autocomplete and allows one
 * catalog to be shared by several topologies, but it makes a descriptor act
 * like a facade and adds ownership plus binding concepts.
 */
export namespace ContractCentered {
	declare const rpcPeerBrand: unique symbol;

	// Opaque Logical Session handle; the brand is not a user-facing member.
	export type IRpcPeer = { readonly [rpcPeerBrand]: never };

	export type RpcExposure<T> = {
		readonly wireName: string;
		readonly implementation: T;
	};

	export interface IRemoteContract<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	> {
		readonly serviceIdentifier: ServiceIdentifier<T>;
		readonly wireName: string;
		readonly methods: NormalizedRpcMethodDefinitions<Definitions>;

		// Contract-centric convenience methods replace peer.resolve,
		// services.expose and acceptor.resolveAll.
		provide(implementation: T): RpcExposure<T>;
		from(peer: IRpcPeer): RemoteService<T, Definitions>;
		fromAll(acceptor: IAcceptor): RemoteServiceGroup<IRpcPeer, T, Definitions>;
	}

	export declare function createRemoteContract<
		T,
		const Definitions extends RpcMethodDefinitions<T>,
	>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: {
			readonly wireName?: string;
			readonly methods: Definitions & ValidateMethodDefinitions<T, Definitions>;
		},
	): IRemoteContract<T, Definitions>;

	export interface IRpcServices extends IDisposable {
		// add() owns the binding, not the topology. Cleanup removes only this
		// exposure and is idempotent.
		add<T>(exposure: RpcExposure<T>): Cleanup;
	}

	export interface IConnector extends IDisposable {
		readonly peer: IRpcPeer;
		connect(): Promise<void>;
	}

	export interface IAcceptor extends IDisposable {
		readonly peers: readonly IRpcPeer[];
		onPeer(listener: (peer: IRpcPeer) => void): Cleanup;
		listen(): Promise<void>;
	}

	export type RpcConnectorAdapter = IRpcConnectorAdapter;
	export type RpcAcceptorAdapter = IRpcAcceptorAdapter;

	export declare function createRpcServices(): IRpcServices;

	export declare function createRpcConnector(options: {
		readonly adapter: RpcConnectorAdapter;
		// Borrowed: disposing the Connector does not dispose services.
		readonly services: IRpcServices;
	}): IConnector;

	export declare function createRpcAcceptor(options: {
		readonly adapter: RpcAcceptorAdapter;
		// Borrowed: several topologies may share this catalog.
		readonly services: IRpcServices;
	}): IAcceptor;
}

/**
 * DRAFT C — FUNCTIONAL / EXPLICIT SEAMS
 *
 * Mental model: exposure, topology and resolution are independent functions.
 * This maximizes substitution and makes every dependency visible, but callers
 * must learn and import many shallow operations. It is included because it is
 * the strongest counterweight to Draft A's aggregate ownership.
 */
export namespace FunctionalSeams {
	export interface IRemoteServiceIdentifier<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	> {
		readonly serviceIdentifier: ServiceIdentifier<T>;
		readonly wireName: string;
		readonly methods: NormalizedRpcMethodDefinitions<Definitions>;
	}

	export declare function createRemoteServiceIdentifier<
		T,
		const Definitions extends RpcMethodDefinitions<T>,
	>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: {
			readonly wireName?: string;
			readonly methods: Definitions & ValidateMethodDefinitions<T, Definitions>;
		},
	): IRemoteServiceIdentifier<T, Definitions>;

	export interface IRpcExposure extends IDisposable {}

	declare const rpcPeerBrand: unique symbol;

	// Opaque Logical Session handle; the brand is not a user-facing member.
	export type IRpcPeer = { readonly [rpcPeerBrand]: never };

	export interface IConnector extends IDisposable {
		readonly peer: IRpcPeer;
		connect(): Promise<void>;
	}

	export interface IAcceptor extends IDisposable {
		readonly peers: readonly IRpcPeer[];
		listen(): Promise<void>;
	}

	export type RpcConnectorAdapter = IRpcConnectorAdapter;
	export type RpcAcceptorAdapter = IRpcAcceptorAdapter;

	export declare function createRpcExposure(): IRpcExposure;

	export declare function exposeRemote<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	>(
		exposure: IRpcExposure,
		service: IRemoteServiceIdentifier<T, Definitions>,
		implementation: T,
	): Cleanup;

	export declare function createRpcConnector(options: {
		readonly adapter: RpcConnectorAdapter;
		readonly exposure: IRpcExposure;
	}): IConnector;

	export declare function createRpcAcceptor(options: {
		readonly adapter: RpcAcceptorAdapter;
		readonly exposure: IRpcExposure;
	}): IAcceptor;

	export declare function resolveRemote<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	>(
		peer: IRpcPeer,
		service: IRemoteServiceIdentifier<T, Definitions>,
	): RemoteService<T, Definitions>;

	export declare function resolveRemoteAll<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	>(
		acceptor: IAcceptor,
		service: IRemoteServiceIdentifier<T, Definitions>,
	): RemoteServiceGroup<IRpcPeer, T, Definitions>;

	export declare function onAcceptedPeer(
		acceptor: IAcceptor,
		listener: (peer: IRpcPeer) => void,
	): Cleanup;
}

/**
 * SHARED RUNTIME RULES FOR ALL THREE DRAFTS
 *
 * Configuration and ordering
 * - Contract creation synchronously throws TypeError for a non-object or empty
 *   methods map, a non-callable implementation member, an unknown method kind
 *   or option, an invalid cancelable value, an empty wire name, or a
 *   constructor/symbol identifier without an explicit wire name. Error messages
 *   identify the exact method/property path.
 * - Each `true` method entry is normalized and frozen as
 *   `{ type: "unary", cancelable: false }`. TypeScript validates keys and handler
 *   signatures; runtime validation covers JavaScript and escaped `any` values.
 * - Exposure synchronously rejects duplicate wire names and disposed owners.
 * - Every draft supports a direct implementation for this first phase.
 *   Container-specific resolution and implementation disposal are absent;
 *   Draft B's binding wrapper exists only as a deletion-test alternative.
 * - Concrete adapter factories synchronously validate inert configuration and
 *   perform no I/O. connect()/listen() operational failures reject.
 * - Proxy/group creation is synchronous, performs no I/O and is allowed before
 *   connect()/listen().
 *
 * Adapter seam
 * - Connector is the sole caller of adapter.connect() and never calls it
 *   concurrently. Each successful call transfers one Physical Connection to it.
 * - Acceptor calls adapter.listen() once, owns the returned listener, and owns
 *   every Physical Connection delivered after listen readiness.
 * - Adapter signals only cancel the pending connect/listen operation. A live
 *   listener is controlled only by listener.dispose(); a live connection by
 *   end()/dispose().
 * - Topology disposal aborts pending adapter work, disposes its listener and all
 *   owned Physical Connections. It never disposes an external HTTP server that
 *   a concrete adapter merely borrows.
 * - `frames` is a single-consumer ordered stream. Completion is normal remote
 *   shutdown; iteration throw is transport failure. Yield transfers a stable
 *   buffer that the adapter cannot reuse. A push source uses bounded buffering
 *   and fails the connection on overflow; an unbounded private queue is invalid.
 * - send() promises express only local admission/backpressure, never delivery,
 *   decoding or ACK. end() flushes an intentional graceful write shutdown;
 *   dispose() is abortive and need not flush.
 * - The framed-pull candidate makes a raw byte adapter own framing/reassembly;
 *   codec and frame contents remain inside the RPC implementation. Until the
 *   later envelope/framing ticket specifies its format and limits, this is a
 *   complete implementation contract for message transports only—not yet TCP.
 *
 * Invocation
 * - Every selected method is Promise-normalized. Non-selected members such as
 *   SearchService.cacheSize are absent from the proxy type and runtime surface.
 * - A call with no Physical Connection rejects RpcError(unavailable), without
 *   an offline queue. A dispatched call whose terminal result is lost rejects
 *   RpcError(interrupted); remote side effects may already have happened.
 * - Remote application failure, unknown service/method, malformed protocol,
 *   cancellation and disposed handles reject the method Promise. They never
 *   synchronously throw from a proxy method.
 * - Abort is cooperative. It signals the handler but cannot promise that the
 *   handler stopped or that side effects were rolled back.
 * - A group method snapshots peers when called, dispatches concurrently, waits
 *   for every item to settle and returns peer-tagged results in snapshot order.
 *   One peer failure never rejects or discards the other peer results.
 *
 * Ownership
 * - Cleanup and dispose() are idempotent. No close(), stop(), disconnect() or
 *   per-proxy release alias is public.
 * - Disposed peer/proxy objects remain ordinary handles whose later method
 *   calls reject RpcError(disposed). They are not silently rebound.
 * - Logical Session peer/proxy identity survives transient Physical Connection
 *   replacement, but not a process restart.
 *
 * DELETION TEST
 * - Keep runtime contract metadata: TypeScript erases method names.
 * - Keep expose separate from Connector/Acceptor: both sides expose identically.
 * - Keep connect()/listen(): callers must await readiness and initial failure.
 * - Keep Connector.peer and Acceptor.peers: one-peer and many-peer association.
 *   Batch results carry the exact peer handle; no speculative public session id
 *   is needed for correlation.
 * - Keep resolve/resolveAll: default unary and fan-out tasks need different
 *   result types; neither should expose raw sendRequest/service/method/args.
 * - Keep onPeer in the draft: without it, passive-side per-peer bidirectional
 *   initiation requires polling. This is a HITL decision, not yet accepted.
 * - Keep Cleanup/dispose(): they are the repository's only lifecycle vocabulary.
 * - Keep ConnectorAdapter.connect, AcceptorAdapter.listen, PhysicalConnection,
 *   frames/send/end, listener.closed and disposal: removing any one makes adapter
 *   authors invent an untracked ownership, readiness, I/O or failure convention.
 * - Delete public connection state: it races with the next call and does not
 *   remove the need to handle Promise rejection.
 * - Delete codec hooks, ACK, retry policy, reconnect policy, pendingCalls,
 *   arbitrary options, streaming placeholders and proxy disposal: they are not
 *   part of the adapter author's irreducible task or the default caller path.
 *
 * RECOMMENDATION TO TEST WITH THE USER
 * - Draft A has the deepest module: two conceptual factory entry points,
 *   aggregate ownership and repository-native resolve/expose vocabulary.
 * - Draft B improves service-local discovery and explicit sharing, but adds a
 *   facade descriptor, binding object, branded options and manual dispose order.
 * - Draft C exposes seams most literally, but its seven top-level operations
 *   make implementation structure leak into every caller.
 */
