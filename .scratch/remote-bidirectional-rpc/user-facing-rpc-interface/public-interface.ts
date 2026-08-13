/**
 * @overview 仅供原型验证——用于比较 RPC 接口的共享声明。
 *
 * 本文件是“验证面向用户的 RPC 接口”议题的一次性讨论材料。它不是包 API 提案，
 * 也绝不得从 `@husky-di/remote` 导出。用法示例作为独立的 `*.usage.ts`
 * 模块与本文件并列存放。
 *
 * 依据：../research/user-facing-rpc-interface-ergonomics.md
 *
 * @author AEPKILL
 * @created 2026-08-12 21:34:00
 */

// 下列占位声明代替现有的 `@husky-di/core` 声明，使该原型保持为
// 可独立执行类型检查的单文件。

// ── 面向调用方与契约作者的共享类型 ──────────────────────────────────────

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

// biome-ignore lint/suspicious/noExplicitAny: 方法键提取必须接受任意参数列表，且不限制变型。
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

export type ValidateMethodDefinitions<T, Definitions extends object> = {
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

// ── Adapter 作者接口与平台无关的内存实现 ─────────────────────────────────

/**
 * 一条生命期有限的全双工物理连接。
 *
 * `frames` 中的每一项都恰好是一个编码完整的 RPC 帧。消息传输可以保留原生边界；
 * 字节流适配器必须负责分帧与重组。帧内容和编解码器归 RPC 实现负责。
 */
export interface IPhysicalConnection extends IDisposable {
	/**
	 * 按传输顺序提供的单消费者接收流。远程正常关闭时迭代结束；
	 * 传输失败时迭代器抛出错误。
	 *
	 * 产出一帧即把内容稳定的缓冲区移交给 RPC 实现；适配器绝不得修改或复用它。
	 * 仅支持推送的传输在无法暂停数据源时，必须使用有界队列。队列溢出属于
	 * 连接故障，必须由该迭代器抛出，绝不意味着允许队列无界增长。
	 */
	readonly frames: AsyncIterable<Uint8Array>;

	/**
	 * 发送一个完整帧。
	 *
	 * Promise 完成表示适配器已复制或消费调用方的字节，并已通过本地背压机制
	 * 接纳该帧。这不表示对等端已收到、解码或确认该帧。
	 *
	 * RPC 实现会依次等待每次发送，因此适配器无需定义并发调用的顺序。
	 */
	send(frame: Uint8Array): Promise<void>;

	/**
	 * 在先前的发送完成后优雅结束出站传输。后续发送会被拒绝。
	 * 不支持半关闭的传输可以同时关闭两个方向。
	 *
	 * 它刻意与同步的 `dispose()` 区分开；后者会中止待处理 I/O，且无需刷新缓冲区。
	 */
	end(): Promise<void>;
}

/** 主动拓扑端口。每次调用都会创建一条新的物理连接。 */
export interface IRpcConnectorAdapter {
	/**
	 * 连接丢失后可再次调用，以提供替代连接。中止会拒绝正在进行的尝试；
	 * 配置错误应由具体适配器工厂处理，并在执行到该方法前抛出。
	 */
	connect(signal: AbortSignal): Promise<IPhysicalConnection>;
}

/** 仅在端点就绪后才返回的活跃被动监听器。 */
export interface IPhysicalConnectionListener extends IDisposable {
	/** 正常释放后完成；监听器后续失败时被拒绝。 */
	readonly closed: Promise<void>;
}

/** 被动拓扑端口。 */
export interface IRpcAcceptorAdapter {
	/**
	 * 开始监听，并将每条已接受连接的所有权移交给 `accept`。返回的监听器
	 * 只拥有适配器的订阅或监听资源，绝不拥有从外部传入的 HTTP 服务器。
	 *
	 * 只有监听就绪后 Promise 才会完成；在此之前不会调用 `accept`。初始失败会
	 * 拒绝该 Promise，监听器后续失败则会拒绝 `listener.closed`。信号只覆盖
	 * 启动阶段：该 Promise 完成或被拒绝后，适配器便停止观察该信号，此后只有
	 * 返回的监听器能控制活跃端点。
	 *
	 * RPC 提供的 `accept` 绝不抛出错误，并会同步接管所有权。监听器被释放或
	 * 关闭后，适配器不得再调用它。
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
 * 具体的测试适配器，使用与生产适配器相同的公开边界。
 * `TransformStream` 写入器的 Promise 让本地背压可被观察，而不是在原型中
 * 隐藏一个无界队列。
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

		// 在等待前先复制，以便调用方可立即复用其缓冲区。
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

// ── Adapter 传输接缝候选 ─────────────────────────────────────────────────

/**
 * 适配器设计备选方案
 *
 * 下列三种具体边界暴露了第一个原型所隐藏的复杂度。后文以根对象、契约和函数为中心的
 * 草案目前都使用上文的完整帧拉取边界；传输单元和消费模型的选择仍需人工参与决策（HITL）。
 */
export namespace AdapterAlternatives {
	/**
	 * 备选方案 1——原始字节块 + `AsyncIterable`。
	 *
	 * 分帧归 RPC 实现负责。该方案可以自然映射到 TCP，但会丢弃 WebSocket 和
	 * `MessagePort` 的边界。通用的完整帧拉取候选方案如今也明确区分优雅结束的 `end()`
	 * 和中止式的 `dispose()`。
	 */
	export namespace RawByteStream {
		export interface IPhysicalConnection extends IDisposable {
			/** 有序字节块；块边界不携带任何协议含义。 */
			readonly bytes: AsyncIterable<Uint8Array>;

			/** 只表示本地接纳或背压，绝不表示已投递或已确认。 */
			write(bytes: Uint8Array): Promise<void>;

			/** 在先前的写入完成后优雅结束写入端。 */
			end(): Promise<void>;
		}

		export interface IRpcConnectorAdapter {
			connect(signal: AbortSignal): Promise<IPhysicalConnection>;
		}

		export interface IRpcAcceptorAdapter {
			/** 就绪后完成；监听器后续失败时，迭代会抛出错误。 */
			listen(signal: AbortSignal): Promise<AsyncIterable<IPhysicalConnection>>;
		}
	}

	/**
	 * 备选方案 2——端到端使用 Web 平台流。
	 *
	 * 背压、优雅关闭、取消和流错误均已标准化，但适配器作者必须正确构造流控制器，
	 * RPC 代码也必须锁定读取器和写入器。字节块边界仍不携带任何协议含义。
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
			/** 就绪后完成；监听器后续失败由流错误报告。 */
			listen(signal: AbortSignal): Promise<ReadableStream<IPhysicalConnection>>;
		}
	}

	/**
	 * 备选方案 3——完整消息 + 回调。
	 *
	 * 该方案与 WebSocket 和 `MessagePort` 高度契合。原始字节传输必须在适配器中
	 * 增加分帧。入站回调没有可跨平台使用的需求信号，因此适配器必须自行限制
	 * 挂接前和运行时的缓冲规模。
	 */
	export namespace MessageCallbacks {
		export interface PhysicalConnectionEvents {
			message(frame: Uint8Array): void;
			close(): void;
			error(cause: unknown): void;
		}

		export interface IPhysicalConnection extends IDisposable {
			/** 恰好安装一次唯一的接收端，并开始投递入站数据。 */
			attach(events: PhysicalConnectionEvents): void;

			/** 只表示本地接纳或背压，绝不表示已投递或已确认。 */
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
			/** 就绪后完成；后续失败恰好调用一次 `events.error`。 */
			listen(events: AcceptorEvents, signal: AbortSignal): Promise<void>;
		}
	}
}

// ── 面向调用方的批量结果与公开接口草案 ───────────────────────────────────

// 结果保留对等端句柄，而不只是其数组下标。即使批量调用进行期间对等端集合发生变化，
// 调用方仍可将结果与 `Acceptor.peers` 中的确切对象关联。
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
 * 草案 A——以根对象为中心
 *
 * 心智模型：一个本地 RPC 根对象拥有共享的服务暴露，以及它创建的每个拓扑。
 * 连接器拥有一个稳定的逻辑会话对等端；接收器拥有所有已接受的对等端。
 * 这是建议作为基线的方案，因为它用最少的概念隐藏了最多会话与注册表机制。
 */
export namespace RootCentered {
	export interface IRemoteServiceIdentifier<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	> {
		readonly serviceIdentifier: ServiceIdentifier<T>;
		readonly wireName: string;
		// 运行时规范形式会把每个 `true` 条目归一化为
		// `{ type: "unary", cancelable: false }`，并冻结结果。
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
		// 在物理连接建立前即可安全调用。执行 I/O 的是方法调用，而不是代理创建。
		// 短暂断线并重连后，同一个代理仍可使用。
		resolve<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
		): RemoteService<T, Definitions>;
	}

	export interface IConnector extends IDisposable {
		// 连接器一经创建，该对等端的身份便确定不变。
		readonly peer: IRpcPeer;

		// 建立初始物理连接。首次成功后，实现可以在短暂断线后恢复该逻辑会话。
		connect(): Promise<void>;
	}

	export interface IAcceptor extends IDisposable {
		// 每次读取都返回一个新的普通只读数组快照。
		readonly peers: readonly IRpcPeer[];

		// 如果每个新接受的逻辑会话都必须收到服务器主动发起的调用，应在 `listen()` 前订阅。
		// 清理函数会移除该监听器。
		onPeer(listener: (peer: IRpcPeer) => void): Cleanup;

		// 适配器准备好接受物理连接后完成。
		listen(): Promise<void>;

		// 返回的服务组对象保持稳定。每次方法调用都会截取当时的对等端快照、
		// 并发调用快照中的对等端，并按快照顺序返回结果。
		resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
		): RemoteServiceGroup<IRpcPeer, T, Definitions>;
	}

	// 适配器作者接口被刻意纳入该原型。
	export type RpcConnectorAdapter = IRpcConnectorAdapter;
	export type RpcAcceptorAdapter = IRpcAcceptorAdapter;

	export interface IRpc extends IDisposable {
		// RPC 根对象只借用该实现。清理函数只移除该服务暴露；
		// 无论调用清理函数还是释放根对象，都不会释放该实现。
		expose<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
			implementation: T,
		): Cleanup;

		// 这两个成员只用于选择主动或被动拓扑。它们刻意不重复
		// `expose()` 或远程服务解析能力。
		connector(adapter: RpcConnectorAdapter): IConnector;
		acceptor(adapter: RpcAcceptorAdapter): IAcceptor;
	}

	export declare function createRpc(): IRpc;
}

/**
 * 草案 B——以契约为中心
 *
 * 心智模型：一个 RemoteContract 拥有单个服务的所有可发现操作。独立的 Services
 * 目录拥有服务暴露，Connector/Acceptor 只借用该目录。这样可以最大化单个服务的
 * 自动补全，并让多个拓扑共享同一目录；代价是 descriptor 会充当 facade，且额外
 * 引入所有权和 binding 概念。
 */
export namespace ContractCentered {
	declare const rpcPeerBrand: unique symbol;

	// 不透明的 Logical Session handle；brand 不是面向用户的成员。
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

		// 以契约为中心的便捷方法取代 peer.resolve、services.expose 和
		// acceptor.resolveAll。
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
		// add() 拥有 binding，而不是 topology。Cleanup 只移除该 exposure，且幂等。
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
		// 借用：释放 Connector 不会释放 services。
		readonly services: IRpcServices;
	}): IConnector;

	export declare function createRpcAcceptor(options: {
		readonly adapter: RpcAcceptorAdapter;
		// 借用：多个 topology 可以共享该目录。
		readonly services: IRpcServices;
	}): IAcceptor;
}

/**
 * 草案 C——函数式/显式接缝
 *
 * 心智模型：exposure、topology 和 resolution 是彼此独立的函数。这样可以最大化
 * 可替换性并让每个依赖都清晰可见，但调用方必须学习并导入许多浅层操作。保留该方案，
 * 是因为它最能与草案 A 的聚合所有权形成对照。
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

	// 不透明的 Logical Session handle；brand 不是面向用户的成员。
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
 * 三个草案共用的运行时规则
 *
 * 配置与顺序
 * - 创建契约时，若 methods map 不是对象或为空、实现成员不可调用、method kind 或
 *   option 未知、cancelable 值无效、wire name 为空，或者 constructor/symbol
 *   identifier 没有显式 wire name，则同步抛出 TypeError。错误消息应指出准确的
 *   method/property 路径。
 * - 每个值为 `true` 的 method 条目都会归一化为
 *   `{ type: "unary", cancelable: false }` 并被冻结。TypeScript 校验 key 和
 *   handler 签名；运行时校验覆盖 JavaScript 以及绕过类型检查的 `any` 值。
 * - exposure 遇到重复 wire name 或已释放的 owner 时同步拒绝。
 * - 第一阶段的每个草案都支持直接传入 implementation；不包含 Container 专用解析和
 *   implementation 释放。草案 B 的 binding wrapper 仅作为删除测试的备选项存在。
 * - 具体 adapter factory 同步校验不触发 I/O 的配置，并且自身不执行 I/O；
 *   connect()/listen() 的运行失败通过 Promise reject 报告。
 * - proxy/group 的创建是同步且不执行 I/O 的，允许发生在 connect()/listen() 前。
 *
 * Adapter 接缝
 * - Connector 是 adapter.connect() 的唯一调用者，且绝不并发调用它。每次成功调用
 *   都会向 Connector 移交一条 Physical Connection。
 * - Acceptor 只调用一次 adapter.listen()，拥有返回的 listener，并拥有监听就绪后
 *   投递的每条 Physical Connection。
 * - Adapter signal 只取消尚未完成的 connect/listen 操作。活跃 listener 仅由
 *   listener.dispose() 控制；活跃 connection 由 end()/dispose() 控制。
 * - 释放 topology 会中止待处理的 adapter 工作，并释放其 listener 和拥有的所有
 *   Physical Connection；不会释放具体 adapter 仅借用的外部 HTTP server。
 * - `frames` 是单消费者有序流。正常完成表示远端正常关闭，迭代抛错表示传输失败。
 *   yield 会移交 adapter 不得复用的稳定 buffer。push source 必须使用有界缓冲，
 *   溢出时令连接失败；无界私有队列不合法。
 * - send() Promise 只表示本地准入/背压，绝不表示投递、解码或 ACK。end() 刷新并
 *   执行有意的优雅写端关闭；dispose() 为中止式释放，无需刷新。
 * - 在 framed-pull 候选中，raw-byte adapter 负责 framing/reassembly；codec 与帧
 *   内容仍留在 RPC 实现内部。在后续 envelope/framing issue 确定格式和上限前，
 *   该契约只足以完整实现 message transport，还不足以完整实现 TCP。
 *
 * 调用
 * - 所有选中的 method 都会被 Promise 化。未选成员（如 SearchService.cacheSize）
 *   不存在于 proxy 类型和运行时表面。
 * - 没有 Physical Connection 时，调用以 RpcError(unavailable) reject，且不进入
 *   offline queue。已发出的调用若丢失最终结果，则以 RpcError(interrupted)
 *   reject；此时远端副作用可能已经发生。
 * - 远端应用失败、未知 service/method、畸形协议、取消和已释放 handle 都会令 method
 *   Promise reject；proxy method 绝不同步抛出这些错误。
 * - Abort 是协作式的：它会通知 handler，但不能保证 handler 已停止或副作用已回滚。
 * - group method 在调用时截取 peer 快照，并发分发，等待每一项 settled，然后按快照
 *   顺序返回带 peer 标识的结果。单个 peer 失败绝不会 reject 或丢弃其他 peer 的结果。
 *
 * 所有权
 * - Cleanup 与 dispose() 均幂等。不公开 close()、stop()、disconnect() 或逐 proxy
 *   release 等同义入口。
 * - 已释放的 peer/proxy 对象仍是普通 handle；之后的方法调用以
 *   RpcError(disposed) reject，不会悄悄重新绑定。
 * - Logical Session 的 peer/proxy 身份可跨越短暂的 Physical Connection 替换，
 *   但不能跨越进程重启。
 *
 * 删除测试
 * - 保留运行时契约元数据：TypeScript 会擦除 method 名称。
 * - expose 与 Connector/Acceptor 分离：两端暴露服务的方式相同。
 * - 保留 connect()/listen()：调用方必须等待就绪状态和初始失败。
 * - 保留 Connector.peer 与 Acceptor.peers：用于关联单 peer 与多 peer。批量结果携带
 *   确切 peer handle，无需为关联而猜测性地公开 session id。
 * - 保留 resolve/resolveAll：默认 unary 与扇出任务需要不同结果类型；两者都不应
 *   暴露原始的 sendRequest/service/method/args。
 * - 草案中保留 onPeer：否则被动端只能轮询，才能针对每个 peer 发起双向调用。
 *   这仍是待人工裁决的决定，尚未接受。
 * - 保留 Cleanup/dispose()：它们是仓库唯一的 lifecycle 词汇。
 * - 保留 ConnectorAdapter.connect、AcceptorAdapter.listen、PhysicalConnection、
 *   frames/send/end、listener.closed 和释放能力：删除其中任意一项，都会迫使 adapter
 *   作者自行发明未被追踪的所有权、就绪状态、I/O 或失败约定。
 * - 删除公开连接状态：它会和下一次调用竞态，也不能免除处理 Promise reject 的需要。
 * - 删除 codec hook、ACK、retry policy、reconnect policy、pendingCalls、任意 option、
 *   streaming placeholder 和 proxy disposal：它们不属于 adapter 作者不可再缩减的任务，
 *   也不属于默认调用路径。
 *
 * 留待与用户验证的建议
 * - 草案 A 的模块最深：只有两个概念上的 factory 入口、聚合所有权，以及仓库原生的
 *   resolve/expose 词汇。
 * - 草案 B 改善单服务发现能力和显式共享，但增加 facade descriptor、binding 对象、
 *   branded option 和手动释放顺序。
 * - 草案 C 最直接地暴露接缝，但七个顶层操作会让实现结构泄漏到每个调用方。
 */
