/**
 * @overview 仅用于原型验证——直接异步 RPC 任务候选接口声明。
 *
 * 本文件集中根对象、对等端和监听器声明，使 Connector 与 Acceptor 的真实用法
 * 可以分别阅读，而不重复候选接口。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
	RpcBatchResultStatusEnum,
	RpcError,
	ValidateMethodDefinitions,
} from "../public-interface";

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

type AnyMethod = (...args: never[]) => unknown;

export type RemoteMethodKey<T> = {
	[K in keyof T]-?: K extends string
		? T[K] extends AnyMethod
			? K
			: never
		: never;
}[keyof T];

/** 省略 `cancelable` 等价于 false；严格的 handler 校验由共享 validator 提供。 */
export type RpcMethodDefinition =
	| true
	| {
			readonly type: "unary";
			readonly cancelable?: false;
	  }
	| {
			readonly type: "unary";
			readonly cancelable: true;
	  };

export type RpcMethodDefinitions<T> = Partial<
	Record<RemoteMethodKey<T>, RpcMethodDefinition>
>;

declare const remoteServiceIdentifierBrand: unique symbol;

/** 不透明：调用方无法检查 wireName、方法元数据或本地标识符。 */
export type RemoteServiceIdentifier<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [remoteServiceIdentifierBrand]: {
		readonly service: T;
		readonly definitions: Definitions;
	};
};

type RemoteMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? Definition extends { readonly cancelable: true }
		? Args extends [...infer Params, AbortSignal]
			? (...args: [...Params, signal?: AbortSignal]) => Promise<Awaited<Result>>
			: never
		: (...args: Args) => Promise<Awaited<Result>>
	: never;

type RequiredKey<T> = {
	[K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

/** 宽化为 Partial 后的 optional key 不能被误认为运行时已经选择。 */
type SelectedMethodKey<Definitions> = Extract<RequiredKey<Definitions>, string>;

export type RemoteService<T, Definitions extends RpcMethodDefinitions<T>> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteMethod<T[K], Definitions[K]>;
};

export type RpcBatchResult<T> =
	| {
			readonly peer: IRpcPeer;
			readonly status: RpcBatchResultStatusEnum.fulfilled;
			readonly value: T;
	  }
	| {
			readonly peer: IRpcPeer;
			readonly status: RpcBatchResultStatusEnum.rejected;
			readonly reason: RpcError;
	  };

type RemoteGroupMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? Definition extends { readonly cancelable: true }
		? Args extends [...infer Params, AbortSignal]
			? (
					...args: [...Params, signal?: AbortSignal]
				) => Promise<readonly RpcBatchResult<Awaited<Result>>[]>
			: never
		: (...args: Args) => Promise<readonly RpcBatchResult<Awaited<Result>>[]>
	: never;

export type RemoteServiceGroup<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteGroupMethod<T[K], Definitions[K]>;
};

export interface IRpcPeer extends IDisposable {
	/** 首次成功后，即使替换物理连接也保持稳定。 */
	proxy<T, Definitions extends RpcMethodDefinitions<T>>(
		service: RemoteServiceIdentifier<T, Definitions>,
	): RemoteService<T, Definitions>;
}

export interface IRpcListener extends IDisposable {
	/** 正常释放后兑现；监听器后续发生故障时拒绝。 */
	readonly closed: Promise<void>;

	/** 当前已接受逻辑会话的最新快照。 */
	readonly peers: readonly IRpcPeer[];

	/**
	 * 每次调用都会捕获对等端快照、并发调用它们，并在每个结果中保留对等端身份。
	 */
	all<T, Definitions extends RpcMethodDefinitions<T>>(
		service: RemoteServiceIdentifier<T, Definitions>,
	): RemoteServiceGroup<T, Definitions>;
}

export interface IRpc extends IDisposable {
	/** 借用实现；清理操作只移除此服务暴露。 */
	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		service: RemoteServiceIdentifier<T, Definitions>,
		implementation: T,
	): Cleanup;

	/**
	 * 仅在首次物理连接成功后兑现。被拒绝的尝试会自行清理，且不返回对等端所有者。
	 */
	connect(adapter: IRpcConnectorAdapter): Promise<IRpcPeer>;

	/**
	 * 监听就绪时兑现。`onPeer` 会在启动前安装，并针对每个新逻辑会话运行一次。
	 * 它的返回值会被忽略，因此回调必须自行处理异步工作的错误。被拒绝的启动会
	 * 自行清理，且不返回监听器所有者。
	 */
	listen(
		adapter: IRpcAcceptorAdapter,
		onPeer?: (peer: IRpcPeer) => void,
	): Promise<IRpcListener>;
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
