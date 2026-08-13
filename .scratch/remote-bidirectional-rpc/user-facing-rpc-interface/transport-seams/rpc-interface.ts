/**
 * @overview 仅用于原型验证——RPC adapter 与 Physical Connection 的候选接口。
 *
 * 本文件集中声明 Connector/Acceptor adapter、平台 port 与三种物理 I/O 方案，
 * 让各类 usage 只展示对应角色需要面对的成员。
 *
 * @author AEPKILL
 * @created 2026-08-13 22:55:37
 */

export interface IDisposable {
	readonly disposed: boolean;
	dispose(): void;
}

/**
 * 固定的监听器状态矩阵
 *
 * | 事件                  | ready                         | closed                 |
 * | --------------------- | ----------------------------- | ---------------------- |
 * | 启动成功              | 兑现                          | 保持等待               |
 * | 启动期间 dispose      | 以类似 AbortError 的 Error 拒绝 | 兑现                   |
 * | 启动失败              | 以启动 Error 拒绝             | 以同一个 Error 对象拒绝 |
 * | dispose/有序关闭      | 已兑现                        | 兑现                   |
 * | ready 后发生运行故障  | 已兑现                        | 以运行 Error 拒绝       |
 *
 * 只有 `ready` 已兑现后才会同步调用 `accept`，开始 close/dispose 后绝不调用。
 * 回调不得抛出异常，并且必须在返回前接管连接的所有权；对监听器执行 dispose
 * 绝不会 dispose 已接收的连接。`dispose()` 可重复调用。
 */
export interface IPhysicalConnectionListener extends IDisposable {
	readonly ready: Promise<void>;
	readonly closed: Promise<void>;
}

export interface IRpcConnectorAdapter<Physical extends IDisposable> {
	/**
	 * 失败或取消时以 Error 拒绝。兑现前由适配器拥有尚未完整建立的资源；兑现后由
	 * RPC 拥有物理连接。
	 */
	connect(signal: AbortSignal): Promise<Physical>;
}

export interface IRpcAcceptorAdapter<Physical extends IDisposable> {
	/** 立即返回；启动结果通过 `listener.ready` 报告。 */
	listen(accept: (connection: Physical) => void): IPhysicalConnectionListener;
}

export interface IAdapterPair<Physical extends IDisposable> {
	readonly connector: IRpcConnectorAdapter<Physical>;
	readonly acceptor: IRpcAcceptorAdapter<Physical>;
}

export interface ITransportBufferLimits {
	/** 构造适配器时拒绝非有限正数。 */
	readonly maxInboundBufferedBytes: number;

	/** 构造适配器时拒绝非有限正数。 */
	readonly maxOutboundBufferedBytes: number;
}

/** 只做编译检查的辅助函数，用于展示每个适配器边界都应执行的校验。 */
export function createTransportBufferLimits(
	maxInboundBufferedBytes: number,
	maxOutboundBufferedBytes: number,
): ITransportBufferLimits {
	for (const [name, value] of [
		["maxInboundBufferedBytes", maxInboundBufferedBytes],
		["maxOutboundBufferedBytes", maxOutboundBufferedBytes],
	] as const) {
		if (!Number.isFinite(value) || value <= 0) {
			throw new TypeError(`${name} must be finite and positive`);
		}
	}

	return { maxInboundBufferedBytes, maxOutboundBufferedBytes };
}

/**
 * 分帧属于 RPC 协议关注点，不属于物理传输缓冲区限制。构造 codec 时会校验
 * `maxFrameBytes` 是有限正数。codec 拒绝编码或解码后超过此值的帧，并负责缓存
 * 不完整帧。返回的帧是非空且内容稳定的缓冲区。
 */
export interface IFrameCodec {
	readonly maxFrameBytes: number;
	encode(frame: Uint8Array): Uint8Array;
	createDecoder(): IFrameDecoder;
}

export interface IFrameDecoder {
	/** 接收一个非空原始数据块，可产出零个或多个完整帧。 */
	push(chunk: Uint8Array): readonly Uint8Array[];

	/** 尾部输入残缺时拒绝，否则产出所有最终帧。 */
	finish(): readonly Uint8Array[];
}

/**
 * 物理 I/O 的共同保证
 *
 * - read 结果非空，并且返回后底层不会再改写其缓冲区；
 * - 最多只能有一个尚未完成的 read/迭代器 next；
 * - write 按调用顺序串行执行；
 * - 单次 write 输入超过 maxOutboundBufferedBytes 时拒绝；
 * - 只有输入已被消费或复制后 write 才会兑现，因此调用方可在兑现后立即复用或修改输入；
 * - dispose 会在本地使连接失效，并以 Error 拒绝尚未完成及未来的 I/O，即使底层清理
 *   只能尽力而为。
 */

export interface IMessageSocketClose {
	readonly code: number;
	readonly reason: string;
	readonly wasClean: boolean;
}

/**
 * port 恰好发出一次 close 事件。Error 可能先于 close 到达，因此适配器只结算一次
 * 终止状态：clean 且 code 为 1000 表示有序关闭；其他任何 code/事件组合都属于故障，
 * 并保留 code 和 reason。
 *
 * dispose 会先让本地 read/write 失效并移除回调，再调用 `close` 尽力完成 WebSocket
 * 关闭握手。它无法保证中止网络传输，也无法保证对端观察到关闭。
 */
export interface IMessageSocketPort {
	readonly bufferedAmount: number;
	onMessage(listener: (message: Uint8Array) => void): () => void;
	onClose(listener: (close: IMessageSocketClose) => void): () => void;
	onError(listener: (error: Error) => void): () => void;
	send(message: Uint8Array): void;
	close(code: number, reason: string): void;
}

export interface IMessageSocketConnectorPort {
	connect(signal: AbortSignal): Promise<IMessageSocketPort>;
}

export interface IMessageSocketAcceptorPort {
	listen(
		accept: (socket: IMessageSocketPort) => void,
	): IPhysicalConnectionListener;
}

export interface ITcpSocketPort extends IDisposable {
	read(): Promise<Uint8Array | undefined>;
	write(bytes: Uint8Array): Promise<void>;
	end(): Promise<void>;
}

export interface ITcpConnectorPort {
	connect(signal: AbortSignal): Promise<ITcpSocketPort>;
}

export interface ITcpAcceptorPort {
	listen(accept: (socket: ITcpSocketPort) => void): IPhysicalConnectionListener;
}

export interface IMemoryDuplexPort {
	readonly readable: ReadableStream<Uint8Array>;
	readonly writable: WritableStream<Uint8Array>;
}

export interface IMemoryDuplexPairFactory {
	create(): readonly [IMemoryDuplexPort, IMemoryDuplexPort];
}

export interface IMessageSocketPorts {
	readonly connector: IMessageSocketConnectorPort;
	readonly acceptor: IMessageSocketAcceptorPort;
}

export interface ITcpPorts {
	readonly connector: ITcpConnectorPort;
	readonly acceptor: ITcpAcceptorPort;
}

/**
 * 未实现的成本草图
 *
 * 下方每个 `declare` 适配器工厂都只用于让编译器看到其必需输入和映射成本；此文件
 * 没有实现其中任何一个。`../websocket-adapters.ts` 只能证明现有的完整帧 WebSocket
 * 接缝可以实现；它不能证明原始字节或 reader/writer 候选方案可行，也不能证明这些
 * TCP 和内存传输草图可行。
 */

/** A——通过 AsyncIterable/send/end 传输完整帧。 */
export namespace CompleteFrameAsyncIterable {
	export interface IPhysicalConnection extends IDisposable {
		/** 只允许单个消费者读取完整帧；对端有序关闭时结束迭代。 */
		readonly frames: AsyncIterable<Uint8Array>;
		send(frame: Uint8Array): Promise<void>;
		end(): Promise<void>;
	}

	/** 未实现的成本草图：回调队列 + bufferedAmount 准入控制。 */
	export declare function createWebSocketAdapterPair(
		ports: IMessageSocketPorts,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;

	/** 未实现的成本草图：此处 TCP 的分帧由 codec 负责。 */
	export declare function createTcpAdapterPair(
		ports: ITcpPorts,
		codec: IFrameCodec,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;

	/** 未实现的成本草图：每次 write 映射为一个内存帧。 */
	export declare function createMemoryAdapterPair(
		factory: IMemoryDuplexPairFactory,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;
}

/** B——原始字节 read/write，刻意不提供用于优雅结束的成员。 */
export namespace RawByteReadWrite {
	export interface IPhysicalConnection extends IDisposable {
		/** 仅当对端有序到达 EOF 时返回 undefined。 */
		read(): Promise<Uint8Array | undefined>;
		write(bytes: Uint8Array): Promise<void>;
	}

	/** 未实现的成本草图：丢弃消息边界。 */
	export declare function createWebSocketAdapterPair(
		ports: IMessageSocketPorts,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;

	/** 未实现的成本草图：直接映射原始 TCP；由 RPC 负责使用 codec。 */
	export declare function createTcpAdapterPair(
		ports: ITcpPorts,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;

	/** 未实现的成本草图：已锁定的 stream 句柄仍归适配器所有。 */
	export declare function createMemoryAdapterPair(
		factory: IMemoryDuplexPairFactory,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;
}

/**
 * C——在连接拥有的已锁定句柄上执行类似 Web Streams 的操作。
 *
 * 这些句柄由连接获取一次，并非对外暴露的可加锁 stream。因此 `dispose()` 可以
 * cancel 连接拥有的 reader，并 abort 连接拥有的 writer；包装层则维持共同的
 * 未完成操作拒绝规则。
 */
export namespace OwnedReaderWriter {
	export interface IReadResult {
		readonly done: boolean;
		readonly value?: Uint8Array;
	}

	export interface IOwnedReader {
		read(): Promise<IReadResult>;
		cancel(reason: Error): Promise<void>;
	}

	export interface IOwnedWriter {
		readonly ready: Promise<void>;
		write(bytes: Uint8Array): Promise<void>;
		close(): Promise<void>;
		abort(reason: Error): Promise<void>;
	}

	export interface IPhysicalConnection extends IDisposable {
		readonly reader: IOwnedReader;
		readonly writer: IOwnedWriter;
	}

	/** 未实现的成本草图：回调向连接拥有的 reader 句柄供给数据。 */
	export declare function createWebSocketAdapterPair(
		ports: IMessageSocketPorts,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;

	/** 未实现的成本草图：句柄包装原始 TCP 的 read/write/end。 */
	export declare function createTcpAdapterPair(
		ports: ITcpPorts,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;

	/** 未实现的成本草图：连接获取并持有两把锁。 */
	export declare function createMemoryAdapterPair(
		factory: IMemoryDuplexPairFactory,
		limits: ITransportBufferLimits,
	): IAdapterPair<IPhysicalConnection>;
}
