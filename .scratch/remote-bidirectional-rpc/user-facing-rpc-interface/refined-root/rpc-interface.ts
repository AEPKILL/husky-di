/**
 * @overview 仅用于原型验证——改良后的根对象中心 RPC 候选接口声明。
 *
 * 本文件集中候选库接口，使 Connector 与 Acceptor 的真实用法能够分文件比较，
 * 同时避免把声明误认为应用开发者需要编写的代码。
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
	RpcBatchResultStatusEnum,
	RpcError,
	RpcMethodDefinitions,
	ServiceIdentifier,
	ValidateMethodDefinitions,
} from "../public-interface";

declare const remoteServiceIdentifierBrand: unique symbol;

export declare namespace RefinedRoot {
	/**
	 * 不透明的运行时契约。私有符号在保留类型推断的同时，不暴露
	 * `wireName`、方法元数据或源 `ServiceIdentifier`。
	 */
	export interface IRemoteServiceIdentifier<
		T,
		Definitions extends RpcMethodDefinitions<T>,
	> {
		readonly [remoteServiceIdentifierBrand]: {
			readonly service: T;
			readonly definitions: Definitions;
		};
	}

	export function createRemoteServiceIdentifier<
		T,
		const Definitions extends RpcMethodDefinitions<T>,
	>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: {
			readonly wireName?: string;
			readonly methods: Definitions & ValidateMethodDefinitions<T, Definitions>;
		},
	): IRemoteServiceIdentifier<T, Definitions>;

	export type RpcBatchResult<Peer, T> =
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

	export type RemoteServiceGroup<
		Peer,
		T,
		Definitions extends RpcMethodDefinitions<T>,
	> = {
		readonly [K in keyof RemoteService<T, Definitions>]: RemoteService<
			T,
			Definitions
		>[K] extends (...args: infer Args) => Promise<infer Result>
			? (
					...args: Args
				) => Promise<readonly RpcBatchResult<Peer, Awaited<Result>>[]>
			: never;
	};

	export interface IRpcPeer {
		resolve<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
		): RemoteService<T, Definitions>;
	}

	export interface IRpcConnector extends IDisposable {
		/** 在该逻辑会话的整个生命周期中保持稳定，包括首次连接前和连接间隙。 */
		readonly peer: IRpcPeer;

		/**
		 * 启动或恢复该逻辑会话。一次连接尝试被拒绝，或后来丢失物理连接，
		 * 都不会让该连接器失去重试能力。
		 */
		connect(): Promise<void>;
	}

	export interface IRpcAcceptor extends IDisposable {
		/** 每次读取都返回当前逻辑会话的新只读快照。 */
		readonly peers: readonly IRpcPeer[];

		/**
		 * 可以在 `listen()` 前注册。它只观察以后出现的逻辑会话；同一会话只触发一次，
		 * 而不是每次物理连接重建都触发。回调的返回值会被忽略，因此它必须自行处理异步失败。
		 * 返回的清理函数可用于提前取消订阅；释放接收器也会取消订阅。
		 */
		onPeer(listener: (peer: IRpcPeer) => void): Cleanup;

		/** 被动端点准备好接受连接后完成。 */
		listen(): Promise<void>;

		/**
		 * 每个方法都会先截取当前对等端的快照，再并发调用快照中的对等端，
		 * 并分别报告每个对等端的结果。
		 */
		resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
		): RemoteServiceGroup<IRpcPeer, T, Definitions>;
	}

	export interface IRpc extends IDisposable {
		/** 借用一个实现；清理时只移除该服务暴露。 */
		expose<T, Definitions extends RpcMethodDefinitions<T>>(
			service: IRemoteServiceIdentifier<T, Definitions>,
			implementation: T,
		): Cleanup;

		createConnector(adapter: IRpcConnectorAdapter): IRpcConnector;
		createAcceptor(adapter: IRpcAcceptorAdapter): IRpcAcceptor;
	}

	export function createRpc(): IRpc;
}
