/**
 * @overview 仅用于原型验证——立即启动的 RPC 拓扑句柄候选接口声明。
 *
 * 本文件集中根对象、Connector、Acceptor 与对等端声明，使两种拓扑的真实用法
 * 可以分别阅读，而不重复候选接口。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import type {
	Cleanup,
	IDisposable,
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
	RemoteService,
	RemoteServiceGroup,
	RpcMethodDefinitions,
	ServiceIdentifier,
	ValidateMethodDefinitions,
} from "../public-interface";

declare const remoteServiceIdentifierBrand: unique symbol;

export type RemoteServiceIdentifier<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [remoteServiceIdentifierBrand]: {
		readonly implementation: T;
		readonly definitions: Definitions;
	};
};

export interface IRpcPeer {
	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
		service: RemoteServiceIdentifier<T, Definitions>,
	): RemoteService<T, Definitions>;
}

export interface IRpcConnector extends IDisposable {
	readonly peer: IRpcPeer;

	/** 只表示首次就绪；后续断开连接不会改变此 Promise 的状态。 */
	readonly ready: Promise<void>;
}

export interface IRpcAcceptor extends IDisposable {
	/** 启动失败或在启动期间被释放时拒绝。 */
	readonly ready: Promise<void>;
	/**
	 * 启动失败时以同一个错误拒绝，释放后兑现，就绪后的运行故障则使其拒绝。
	 * 调用方可以在等待 ready 之前观察它。
	 */
	readonly closed: Promise<void>;
	readonly peers: readonly IRpcPeer[];

	/** 为对端列表创建快照并并发调用，返回附带对端信息的结果。 */
	resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
		service: RemoteServiceIdentifier<T, Definitions>,
	): RemoteServiceGroup<IRpcPeer, T, Definitions>;
}

export interface IRpc extends IDisposable {
	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		service: RemoteServiceIdentifier<T, Definitions>,
		implementation: T,
	): Cleanup;

	/** 立即启动主动 I/O，并同步返回其所有者。 */
	connect(adapter: IRpcConnectorAdapter): IRpcConnector;

	/** 安装 `onPeer`、启动被动 I/O，并同步返回其所有者。 */
	listen(
		adapter: IRpcAcceptorAdapter,
		onPeer?: (peer: IRpcPeer) => void,
	): IRpcAcceptor;
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
): RemoteServiceIdentifier<T, Definitions>;

export declare function createRpc(): IRpc;
