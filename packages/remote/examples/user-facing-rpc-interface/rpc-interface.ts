/**
 * @overview @husky-di/remote 设计示例——暂定的双向 RPC 公开 interface。
 *
 * 当前只保留 peer-owned exposure、独立 Connector/Acceptor owner，以及
 * Promise unary/topology/transport command 与 Observable event seam。它不是
 * `@husky-di/remote` 的生产接口。
 *
 * @author AEPKILL
 * @created 2026-08-14 22:41:11
 */

import type { Observable } from "rxjs";

// ── 共享契约与远程方法映射 ──────────────────────────────────────────────

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

/**
 * `cancelable` 省略时按 false 处理；只有可取消 handler 才必须显式写 true。
 * 本地 handler 必须保留尾随 AbortSignal；远程 caller 可在同一位置选择性传入 signal。
 */
export type RpcUnaryMethodDefinition<F extends AnyMethod = AnyMethod> = (IsAny<
	Awaited<ReturnType<F>>
> extends true
	? unknown
	: Extract<Awaited<ReturnType<F>>, Observable<unknown>> extends never
		? unknown
		: never) &
	(
		| (HasNoParameters<F> extends true
				? true | { readonly type: "unary"; readonly cancelable?: false }
				: ParametersContainAbortSignal<F> extends false
					?
							| true
							| {
									readonly type: "unary";
									readonly cancelable?: false;
							  }
					: never)
		| (HasValidCancellationSlot<F> extends true
				? {
						readonly type: "unary";
						readonly cancelable: true;
					}
				: never)
	);

export type RpcMethodDefinitions<T> = Partial<{
	readonly [K in RemoteMethodKey<T>]: RpcUnaryMethodDefinition<
		Extract<T[K], AnyMethod>
	>;
}>;

type ValidateNonCancelableMethodDefinition<F extends AnyMethod, Definition> =
	HasNoParameters<F> extends true
		? Definition
		: ParametersContainAbortSignal<F> extends false
			? Definition
			: never;

type NonUndefinedCancelableValue<Definition> = Exclude<
	Definition[Extract<"cancelable", keyof Definition>],
	undefined
>;

type ValidateNonCancelableOption<Definition> =
	"cancelable" extends keyof Definition
		? Pick<
				Definition,
				Extract<"cancelable", keyof Definition>
			> extends Required<
				Pick<Definition, Extract<"cancelable", keyof Definition>>
			>
			? Definition extends { readonly cancelable: false }
				? Definition
				: never
			: [NonUndefinedCancelableValue<Definition>] extends [never]
				? never
				: [NonUndefinedCancelableValue<Definition>] extends [false]
					? Definition
					: never
		: Definition;

type ValidateMethodDefinition<F extends AnyMethod, Definition> =
	Definition extends RpcUnaryMethodDefinition<F>
		? Definition extends true
			? ValidateNonCancelableMethodDefinition<F, Definition>
			: Definition extends { readonly type: "unary" }
				? Exclude<keyof Definition, "type" | "cancelable"> extends never
					? Definition extends { readonly cancelable: true }
						? HasValidCancellationSlot<F> extends true
							? Definition
							: never
						: ValidateNonCancelableOption<Definition> extends never
							? never
							: ValidateNonCancelableMethodDefinition<F, Definition>
					: never
				: never
		: never;

export type ValidateMethodDefinitions<T, Definitions extends object> = {
	readonly [K in keyof Definitions]: K extends RemoteMethodKey<T>
		? ValidateMethodDefinition<Extract<T[K], AnyMethod>, Definitions[K]>
		: never;
};

type RequiredKey<T> = {
	[K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

/** 宽化为 Partial 后的 optional key 不能被误认为运行时已经选择。 */
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

// ── Adapter seam ─────────────────────────────────────────────────────────

/** 一条生命期有限、不可重开的全双工连接。 */
export interface IConnection {
	/**
	 * 按传输顺序提供的 hot、单订阅消息源。订阅回调不会在 subscribe() 返回前执行；
	 * 远端正常关闭时 complete，传输失败或缓冲溢出时 error。
	 *
	 * 每一项都是内容稳定的完整 encoded RPC message。消息 transport 保留原生边界；
	 * raw-byte adapter 负责 framing/reassembly。无法暂停的 push source 必须使用
	 * 有界缓存。取消唯一 subscription 表示放弃该连接，adapter 会在内部中止它。
	 */
	readonly message$: Observable<Uint8Array>;

	/**
	 * Promise 只表示 adapter 已复制或消费输入，并完成本地 admission/backpressure；
	 * 不表示远端已经收到、解码或确认消息。RPC 会依次等待每次调用。
	 */
	send(message: Uint8Array): Promise<void>;

	/**
	 * 幂等地优雅关闭整条连接。调用会同步进入 closing 状态，使后续 send 拒绝；
	 * Promise 在底层关闭完成时兑现，关闭失败时拒绝；已有 message$ 订阅会先观察到
	 * 对应 terminal。异常传输由 adapter 内部中止，不再向调用方暴露第二个 abortive
	 * lifecycle member。
	 */
	close(): Promise<void>;
}

export interface IRpcConnectorAdapter {
	/** 兑现后把新连接的所有权移交给 Connector；signal 只取消建连阶段。 */
	connect(signal: AbortSignal): Promise<IConnection>;
}

export interface IRpcAcceptorAdapter extends IDisposable {
	/**
	 * Acceptor 在 listen 前持有唯一订阅，以无竞态观察 hot、不重放的连接流。listen
	 * 兑现前不 emit；每个 next 同步且仅一次地把 connection 所有权移交给 Acceptor。
	 * 正常 dispose 时 complete，启动或后续监听故障时 error。
	 */
	readonly connection$: Observable<IConnection>;

	/** Adapter 就绪后兑现；signal 只取消启动阶段，后续生命周期由 dispose 结束。 */
	listen(signal: AbortSignal): Promise<void>;
}

// ── 暂定的 caller interface ──────────────────────────────────────────────

declare const remoteServiceIdentifierBrand: unique symbol;

/** 不透明远程服务契约；runtime implementation 保留规范化后的 descriptor。 */
export interface IRemoteServiceIdentifier<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> {
	readonly [remoteServiceIdentifierBrand]: {
		readonly service: T;
		readonly definitions: Definitions;
	};
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
	/**
	 * 在该 Logical Session 上暴露借用的 implementation。注册跨越 Physical
	 * Connection 替换而继续有效；Cleanup 只移除这一次 exposure。
	 */
	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceIdentifier<T, Definitions>,
		implementation: T,
	): Cleanup;

	/**
	 * 同步创建稳定 proxy；实际调用没有可用连接时异步拒绝。可取消 method 接受可选的
	 * 尾随 AbortSignal；取消时会终止远端调用、中止注入给本地 handler 的 signal，
	 * 并以 canceled RpcError 拒绝 Promise。
	 */
	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceIdentifier<T, Definitions>,
	): RemoteService<T, Definitions>;
}

export interface IRpcConnector extends IDisposable {
	/** 从 Connector 创建起保持稳定，包括首次连接前和连接间隙。 */
	readonly peer: IRpcPeer;

	/**
	 * 用 adapter 启动或恢复同一 Logical Session；只接管其兑现的 connection，不接管
	 * adapter。同一 adapter 的重叠调用合并；进行中的 attempt 收到不同 adapter，或当前
	 * connection 仍可用时再次调用，都会拒绝且不调用或保留新 adapter。失败或连接终止后
	 * 可在同一 owner、peer 和 proxy 上重试。
	 */
	connect(adapter: IRpcConnectorAdapter): Promise<void>;
}

export interface IRpcAcceptor extends IDisposable {
	/** 每次读取都返回当前 Logical Session 对应 peer 的新只读快照。 */
	readonly peers: readonly IRpcPeer[];

	/**
	 * 对所有当前及未来 peer 原子暴露借用的 implementation。Cleanup 从同一作用域
	 * 移除 exposure；相同 Wire Service Name 冲突会同步拒绝且不留下部分注册。
	 */
	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceIdentifier<T, Definitions>,
		implementation: T,
	): Cleanup;

	/**
	 * 在 listen 前订阅即可无竞态观察新 Logical Session 的 hot 事件流；不重放历史，
	 * dispose 时 complete，Acceptor 故障时 error。
	 */
	readonly peer$: Observable<IRpcPeer>;

	/**
	 * 调用即把 adapter 所有权交给 Acceptor。首次调用会先订阅 connection$ 再启动 adapter；
	 * 同一 adapter 的重叠调用合并，就绪后的重复调用直接完成。其他 adapter 会被立即 dispose
	 * 并拒绝；启动失败会 dispose 已接管的 adapter 并终止该 Acceptor。
	 */
	listen(adapter: IRpcAcceptorAdapter): Promise<void>;

	/**
	 * 每次远程方法调用时截取 peers 快照，并保留每项结果对应的 peer。单 peer 失败留在
	 * 结果数组中；caller signal 取消整个 batch，并以 canceled RpcError 拒绝 Promise。
	 */
	resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
		service: IRemoteServiceIdentifier<T, Definitions>,
	): RemoteServiceGroup<IRpcPeer, T, Definitions>;
}

/** 创建未启动 owner；peer 及其 expose、resolve 在 connect 前即可使用。 */
export declare function createRpcConnector(): IRpcConnector;

/** 创建未启动 owner；expose、resolveAll 与 peer$ 在 listen 前即可使用。 */
export declare function createRpcAcceptor(): IRpcAcceptor;
