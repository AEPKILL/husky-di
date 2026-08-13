# 面向使用者的 RPC interface 人体工学研究

> 调研日期：2026-08-12。只采用官方文档、规范和第一方源码；源码链接固定到调研时的 commit。本文是“验证面向用户的 RPC 接口”的研究资产，不是规范。

> **HITL 修正（2026-08-12）**：第一期不假设 Container，且所有草案必须支持直接借用本地 implementation；是否需要更一般的 factory/provider 仍接受删除测试。adapter author 是真实使用者，因此原型完整展示了主动连接、被动监听、Physical Connection 双向收发、failure、backpressure、ownership、dispose 和内存 adapter，不把这些复杂度排除在人体工学评审之外。

## 结论先行

成熟方案反复证明了四件事：

1. **运行时 contract 不可省略。** TypeScript 类型会擦除。Connect 和 Cap'n Proto 从 schema 生成 descriptor；vscode-jsonrpc 的 `RequestType` 自带 method string 与参数结构；Comlink 省掉 schema 的代价是运行时可沿任意属性路径访问，且官方把 TypeScript 映射称为 best-effort。
2. **普通调用应只剩 proxy method + Promise。** Connect 的 `createClient(descriptor, transport)` 和 Comlink 的 `wrap(endpoint)` 都把序列化、request id、错误回传藏到 seam 后面。
3. **对象 handle 的稳定范围必须说清。** Cap'n Proto 明确区分 connection-scoped capability 与可跨新连接恢复的 persistent token。husky-di 的普通 proxy 应绑定 Logical Session、跨 Physical Connection 重连保持稳定，但不承诺跨进程重启。
4. **adapter author 也是使用者，transport seam 不能留白。** 第一阶段候选必须完整写出主动 `connect(signal)`、被动 `listen(accept, signal)`、Physical Connection 的 framed pull receive、`send()` backpressure、graceful `end()`、failure、ownership 与 abortive `dispose()`。ACK、协议级 flow control、重连队列和 pending-call bookkeeping 仍留在后续协议设计中。
5. **逐方法 descriptor 应同时承载调用形态与 handler 能力。** Protobuf-ES 以每个方法的 `methodKind` 判别 unary / 三种 streaming，并据此映射 client 类型；gRPC 未写 `stream` 的方法天然是 unary。husky-di 因而用逐方法 map，并允许单个方法值 `true` 简写为 `{ type: "unary", cancelable: false }`；不接受顶层 `methods: true`。

## 证据矩阵

| 观察维度 | Connect / gRPC 风格 | Comlink 风格 | vscode-jsonrpc 风格 | Cap'n Proto object-capability 风格 | 对 husky-di 的压力 |
| --- | --- | --- | --- | --- | --- |
| Contract 声明与运行时元数据 | `.proto` 同时定义服务、方法和消息；生成的 `GenService` 在运行时保留逐方法 `methodKind`、input、output。Protobuf-ES 以 `methodKind` 的字面量联合区分 unary / 三种 streaming，Connect 再以 conditional mapped type 生成不同 client 签名。[descriptor 类型](https://github.com/bufbuild/protobuf-es/blob/f55f8733a732cdc9a74bef7d29b21b3edad52392/packages/protobuf/src/types.ts#L150-L232) · [client 映射](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/promise-client.ts#L31-L70) · [server registration](https://connectrpc.com/docs/node/getting-started/#implement-the-service) | `expose(value, endpoint)` 暴露对象，`wrap(endpoint)` 用 ES Proxy 沿属性 path 动态调用；所有属性/函数均可成为 surface。官方说明 `Remote<T>` 只是 best-effort。[README](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/README.md#L153-L160) · [类型映射](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/comlink.ts#L33-L126) · [动态 path dispatch](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/comlink.ts#L301-L360) | `RequestType` 同时携带 method string、参数个数与 parameter structure；同一个 type 交给 `sendRequest()` 和 `onRequest()`。[message signature](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/messages.ts#L217-L299) | schema 编译为明确的 `Client` / `Server` 类型和逐方法 request builder；未实现的方法默认抛错。[generated code](https://capnproto.org/cxxrpc.html#generated-code) | `RemoteServiceIdentifier` 必须同时持有源 `ServiceIdentifier`、稳定 Wire Service Name，以及逐方法 runtime descriptor。method map 的 key 是显式 remote surface；value 同时描述调用形态和 handler cancellation 注入，不能假设能从 `T` 反射。 |
| Exposure 与连接拓扑 | server implementation 注册到 `ConnectRouter`，随后由 Node/Fastify 等 adapter 托管；业务 registration 与具体 server adapter 分开。[router registration](https://connectrpc.com/docs/node/getting-started/#implement-the-service) · [server adapter](https://connectrpc.com/docs/node/getting-started/#start-a-server) | `expose()` 和 `wrap()` 都直接接收 endpoint；SharedWorker 示例甚至要求在每次 `onconnect` 中 expose，因此 exposure 与物理 endpoint 耦合。[SharedWorker](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/README.md#L130-L148) | 两端以相同的 `MessageConnection` 建立 channel；双方都能 `sendRequest` / `onRequest`，但 handler registration 与 reader/writer 生命周期都在 connection 上。[对称示例](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/README.md#L7-L46) · [interface](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L506-L580) | server constructor 接收 bootstrap capability；client 从连接取 main capability。capability 后续可双向传递，但 bootstrap 与建连仍一起装配。[client/server startup](https://capnproto.org/cxxrpc.html#initializing-rpc) | 采用 Connect 的 registration/adapter 分离，同时保留 vscode-jsonrpc 的 peer 对称性：exposure 属于共享 RPC root，Connector/Acceptor 只表达主动/被动拓扑。 |
| 默认调用路径 | unary method 是 `await client.say(request)`；返回类型由 descriptor 映射为 Promise。[using clients](https://connectrpc.com/docs/web/using-clients/) | `await proxy.method()`；同步返回也 Promise 化，远端异常在本地重新抛出。[wrap/expose](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/README.md#L155-L160) | 调用者需显式写 `connection.sendRequest(type, params)`；比 service proxy 更诚实但更浅，method type 会在每个 call site 重现。[sendRequest](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L506-L532) | generated client 为每个方法生成 `fooRequest()`、填写参数、`send()`；远程调用显式返回 promise。[client calls](https://capnproto.org/cxxrpc.html#clients) | 对业务 caller 采用 typed proxy；不公开 `sendRequest(service, method, args)`。显式 request primitive 留在 implementation 内部。 |
| Stable handle 与重连 | `Client` 持有注入的 `Transport`；官方 interface 没有 session identity 或跨 transport reconnect contract。[client source](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/promise-client.ts#L39-L65) | proxy 绑定一个 endpoint；`releaseProxy` 会 detach 并关闭 MessagePort。没有替换 endpoint 后保持 proxy identity 的 contract。[release](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/comlink.ts#L425-L499) | connection 绑定 reader/writer；dispose 会 reject 全部 pending response 并 dispose 二者，没有 rebind seam。[dispose](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L1539-L1567) | 普通 capability 在连接丢失后变为 disconnected，后续调用抛异常；协议 Level 2 用显式 save/restore token 跨新连接恢复，但官方同时说明主 C++ 实现目前只到 Level 1，不能把 persistence 当默认能力。[disconnect 与 persistent capability](https://capnproto.org/rpc.html#handling-disconnects) · [protocol levels](https://capnproto.org/rpc.html#protocol-features) | 把稳定性限定在 Logical Session：同一 peer/proxy 跨 Physical Connection 重连有效；任一进程重启后旧 session handle 终止。不要暗示 durable capability。 |
| Cancellation | 所有 Connect client method 都接受同一种可选 `CallOptions`，其中含 `signal?: AbortSignal`；descriptor 本身没有 cancellable flag。server `HandlerContext.signal` 可传播到下游。[CallOptions 源码](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/call-options.ts#L15-L47) · [handler context](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/implementation.ts#L59-L88) | 公开 protocol 只有 GET/SET/APPLY/CONSTRUCT/ENDPOINT/RELEASE，没有 CANCEL；pending request promise 没有 signal 参数。[protocol](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/protocol.ts#L59-L110) | `sendRequest` 最后可接 `CancellationToken`；取消会发 `$/cancelRequest`，handler 收到 receiver token。[send side](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L1360-L1460) | handler context 包含 cancellation logistics；销毁 promise/task 可取消本地异步工作。[server context](https://capnproto.org/cxxrpc.html#servers) · [promise cancellation](https://capnproto.org/cxxrpc.html#other-features) | `cancelable` 只表示 RPC runtime 会向该用户 handler 注入尾随 `AbortSignal`，不表示 wire 上只有这些方法能取消。协议仍可取消所有 in-flight call；abort 是 cooperative request，不保证远端副作用未发生。[gRPC cancellation](https://grpc.io/docs/guides/cancellation/) · [DOM contract](https://dom.spec.whatwg.org/#interface-AbortSignal) |
| 多 peer 与部分结果 | 单 client/transport interface；没有 all-peers fan-out。调用者只能在更高层组合多个 client。（由公开 `Client` interface 推断。） | 单 endpoint root proxy；SharedWorker 为每个 port 分别 wrap/expose，没有聚合结果。（由公开 interface 推断。） | 单 `MessageConnection`；progress token 解决单连接增量结果，不解决 peer fan-out。（由公开 interface 推断。） | Level 3 可介绍第三方 capability，但不是 all-peers batch，也不定义部分失败数组。[protocol levels](https://capnproto.org/rpc.html#protocol-features) | `Acceptor.resolveAll()` 是项目自己的深模块价值：调用时 snapshot peers，并返回 peer-tagged settled result。其形状借用 `Promise.allSettled()` 的“不短路并保留每项结果”，但必须额外带 `peer`。[ECMAScript allSettled](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.allsettled) |
| Disposal 与 ownership | generated Promise client 没有 per-proxy dispose；transport/server ownership 在装配层。测试时可用同一 `Transport` seam 换成 `createRouterTransport()`。[testing adapter](https://connectrpc.com/docs/web/testing/#mocking-transports) | 每个 proxy 有 `[releaseProxy]()`；可能由 `FinalizationRegistry` 自动释放，exposed object 可有 finalizer。[release/finalizer](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/README.md#L213-L228) | handler registration 返回 `Disposable`；connection `dispose()` 幂等并 reject pending calls。[connection lifecycle](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L520-L580) · [dispose implementation](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L1539-L1560) | capability client 使用引用计数；连接断开或引用全部 drop 后 server object 可释放。[client ownership](https://capnproto.org/cxxrpc.html#clients) · [disconnect cleanup](https://capnproto.org/rpc.html#handling-disconnects) | 不把 transport ownership 塞进每个 proxy。exposure 返回 core `Cleanup`；RPC root、Connector、Acceptor 使用既有幂等 `dispose()`；peer/proxy 生命周期由拓扑 owner 管理。 |
| Error surface | 所有调用错误归一为 `ConnectError`，含固定 `Code`、message、metadata、typed details；取消和 deadline 也在同一分类中。[errors](https://connectrpc.com/docs/web/errors/) | `Error` 的 name/message/stack 被序列化并在另一端重建；非 Error throw 也会原样 throw。没有稳定的分类 code。[throw handler](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/comlink.ts#L232-L283) | `ResponseError` 有 number code/message/data；标准含 MethodNotFound、InvalidParams，library 另有 MessageWriteError、PendingResponseRejected。[errors](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/messages.ts#L36-L145) | disconnected 是必须由 caller 捕获的明确异常；未实现的方法默认异常。[disconnect](https://capnproto.org/rpc.html#handling-disconnects) · [server methods](https://capnproto.org/cxxrpc.html#servers) | 一个 `RpcError` + 字符串 enum 足够覆盖 unavailable、interrupted/outcome-unknown、canceled、remote application、unknown service/method、disposed、protocol；不要把 transport 原始异常直接泄漏给 caller。 |
| Adapter seam | `Transport` 只有 unary/stream，client 不依赖 HTTP 实现；同一 seam 有 Web、Node 和 in-memory router adapter。[transport source](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/transport.ts#L24-L56) · [in-memory](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/router-transport.ts#L20-L53) | 最小 `Endpoint` 是 `postMessage` + event listener + optional `start()`；`windowEndpoint()` 做平台适配。[endpoint](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/protocol.ts#L7-L33) | `createMessageConnection(reader, writer)`；common/node/browser exports 分离，业务 connection 不依赖具体 stream 类型。[factory](https://github.com/microsoft/vscode-languageserver-node/blob/404c31bb1c7fe6739f1bda9b48002fea8a38facf/jsonrpc/src/common/connection.ts#L608-L615) | RPC 协议位于 byte stream 上，TLS 另行分层；EZ RPC 隐藏低层细节。[encryption/stream](https://capnproto.org/rpc.html#encryption) · [EZ RPC](https://capnproto.org/cxxrpc.html#initializing-rpc) | adapter author 的候选 seam 必须能被直接实现和测试：`connect(signal)` 建立一条连接，startup-only `listen(accept, signal)` 交付连接并返回 listener；每条连接以完整 frame 为单位 pull receive、以 Promise `send()` 暴露本地 admission/backpressure，并区分 graceful `end()` 与 abortive `dispose()`。该 contract 对 message transport 完整；raw-byte/TCP 仍等待 framing format 与 limits。 |

## 极简 interface 草案：一个 RPC root

### 两个 conceptual entry points

```typescript
import type {
  Cleanup,
  IDisposable,
  ServiceIdentifier,
} from "@husky-di/core";

type AnyMethod = (...args: any[]) => unknown;

type RemoteMethodKey<T> = {
  [K in keyof T]-?: K extends string
    ? T[K] extends AnyMethod
      ? K
      : never
    : never;
}[keyof T];

type UnaryMethodConfiguration<F extends AnyMethod> =
  | (Extract<Parameters<F>[number], AbortSignal> extends never
      ? true | {
          readonly type: "unary";
          readonly cancelable: false;
        }
      : never)
  | (F extends (...args: [...infer _Args, AbortSignal]) => unknown
      ? {
          readonly type: "unary";
          readonly cancelable: true;
        }
      : never);

type RemoteMethodsConfiguration<T> = {
  readonly [K in RemoteMethodKey<T>]?: UnaryMethodConfiguration<
    Extract<T[K], AnyMethod>
  >;
};

type ExactRemoteMethodsConfiguration<T, M> = M &
  Record<Exclude<keyof M, RemoteMethodKey<T>>, never>;

type IsCancelableConfiguration<C> = C extends {
  readonly cancelable: true;
}
  ? true
  : false;

type NormalizedMethodConfiguration<C> = {
  readonly type: "unary";
  readonly cancelable: IsCancelableConfiguration<C>;
};

export interface RemoteServiceIdentifier<
  T,
  M extends RemoteMethodsConfiguration<T>,
> {
  /** 原 DI identity；创建 remote contract 不改变它的 equality。 */
  readonly serviceIdentifier: ServiceIdentifier<T>;
  /** 稳定 wire identity。 */
  readonly wireName: string;
  /**
   * 唯一、非空、冻结的 callable surface；运行时只保存 normalized form。
   * `true` 在创建时已经变成 `{ type: "unary", cancelable: false }`。
   */
  readonly methods: Readonly<{
    [K in keyof M]: NormalizedMethodConfiguration<M[K]>;
  }>;
}

/** Entry point 1：将被擦除的 TypeScript contract 固化为 runtime descriptor。 */
export declare function createRemoteServiceIdentifier<
  T,
  const M extends RemoteMethodsConfiguration<T>,
>(
  serviceIdentifier: ServiceIdentifier<T>,
  options: {
    /** string identifier 默认取自身；constructor / symbol 必填。 */
    readonly wireName?: string;
    /** 必须是逐方法 map；不接受顶层 `methods: true`。 */
    readonly methods: ExactRemoteMethodsConfiguration<T, M>;
  },
): RemoteServiceIdentifier<T, M>;

type RemoteMethod<F, Cancelable extends boolean> =
  F extends (...args: infer A) => infer R
    ? Cancelable extends true
      ? A extends [...infer P, AbortSignal]
        ? (...args: [...P, signal?: AbortSignal]) => Promise<Awaited<R>>
        : never
      : (...args: A) => Promise<Awaited<R>>
    : never;

export type RemoteService<
  T,
  M extends RemoteMethodsConfiguration<T>,
> = {
  readonly [K in Extract<keyof M, RemoteMethodKey<T>>]: RemoteMethod<
    Extract<T[K], AnyMethod>,
    IsCancelableConfiguration<M[K]>
  >;
};

export enum RpcPeerStateEnum {
  unavailable = "unavailable",
  available = "available",
  disposed = "disposed",
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
  readonly peer?: IRpcPeer;
  readonly remote?: RemoteError;
}

export interface IRpcPeer {
  /** Logical Session handle 的即时状态；不是一次 Physical Connection。 */
  readonly state: RpcPeerStateEnum;

  /** 可在尚未连接时调用；返回的 proxy identity 可跨瞬时重连继续使用。 */
  resolve<
    T,
    M extends RemoteMethodsConfiguration<T>,
  >(
    service: RemoteServiceIdentifier<T, M>,
  ): RemoteService<T, M>;
}

export enum RpcBatchResultStatusEnum {
  fulfilled = "fulfilled",
  rejected = "rejected",
}

export type RpcPeerResult<T> =
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

type RemoteGroupMethod<F, Cancelable extends boolean> =
  F extends (...args: infer A) => infer R
    ? Cancelable extends true
      ? A extends [...infer P, AbortSignal]
        ? (...args: [...P, signal?: AbortSignal]) => Promise<readonly RpcPeerResult<Awaited<R>>[]>
        : never
      : (...args: A) => Promise<readonly RpcPeerResult<Awaited<R>>[]>
    : never;

export type RemoteServiceGroup<
  T,
  M extends RemoteMethodsConfiguration<T>,
> = {
  readonly [K in Extract<keyof M, RemoteMethodKey<T>>]: RemoteGroupMethod<
    Extract<T[K], AnyMethod>,
    IsCancelableConfiguration<M[K]>
  >;
};

export interface IConnector extends IDisposable {
  /** 在 create 后立即存在；connect 前即可 resolve proxy。 */
  readonly peer: IRpcPeer;

  /** 建立首个 Physical Connection；成功后由实现维护该 Logical Session。 */
  connect(): Promise<void>;
}

export interface IAcceptor extends IDisposable {
  /** 每次读取返回普通 readonly array snapshot，不带隐藏方法。 */
  readonly peers: readonly IRpcPeer[];

  /** adapter 已可接受连接时 fulfill。 */
  listen(): Promise<void>;

  /** 可在 listen 前获得；每次 method call 才 snapshot peers。 */
  resolveAll<
    T,
    M extends RemoteMethodsConfiguration<T>,
  >(
    service: RemoteServiceIdentifier<T, M>,
  ): RemoteServiceGroup<T, M>;
}

/**
 * 一条有限生命周期、全双工的 Physical Connection。
 * `frames` 的每一项都是完整 encoded RPC frame；内容与 codec 由 RPC 实现拥有。
 */
export interface IPhysicalConnection extends IDisposable {
  /**
   * 单消费者、保持 transport 顺序；正常远端关闭结束，failure 从 iterator 抛出。
   * yield 会转移一个稳定且不可复用的 buffer。不能暂停的 push transport 必须
   * 使用 bounded buffer；overflow 是 connection failure，不能退化为无界队列。
   */
  readonly frames: AsyncIterable<Uint8Array>;

  /**
   * fulfillment 只表示 adapter 已复制/消费 bytes，并通过本地
   * admission/backpressure；不表示 peer 已接收、decode 或 ACK。
   */
  send(frame: Uint8Array): Promise<void>;

  /**
   * 等待先前 send 后 graceful 结束 outbound；后续 send reject。
   * 不支持 half-close 的 transport 可关闭双向。与不保证 flush 的 dispose 不同。
   */
  end(): Promise<void>;
}

/** 主动 topology port；每次调用创建新的 Physical Connection。 */
export interface IRpcConnectorAdapter {
  /** loss 后可再次调用；AbortSignal 取消尚未完成的建连。 */
  connect(signal: AbortSignal): Promise<IPhysicalConnection>;
}

/** endpoint ready 后返回的被动 listener。 */
export interface IPhysicalConnectionListener extends IDisposable {
  /** 正常 dispose 后 fulfill；后续 listener failure 时 reject。 */
  readonly closed: Promise<void>;
}

/** 被动 topology port。 */
export interface IRpcAcceptorAdapter {
  /**
   * ready 后才 fulfill，且此前不调用 accept；初始 failure reject listen，
   * 后续 failure reject listener.closed。accept 接管每条 connection。
   * signal 只覆盖 startup；promise settle 后 adapter 停止观察它，存活 endpoint
   * 只由 listener.dispose() 控制。
   */
  listen(
    accept: (connection: IPhysicalConnection) => void,
    signal: AbortSignal,
  ): Promise<IPhysicalConnectionListener>;
}

export interface IRpc extends IDisposable {
  /**
   * 暴露对所有当前及未来 peer 生效；RPC 借用 implementation。
   * 返回的 Cleanup 只撤销本次 exposure，不 dispose implementation。
   */
  expose<
    T,
    M extends RemoteMethodsConfiguration<T>,
  >(
    service: RemoteServiceIdentifier<T, M>,
    implementation: T,
  ): Cleanup;

  /** 只创建主动拓扑；不复制 expose/resolve。 */
  connector(adapter: IRpcConnectorAdapter): IConnector;

  /** 只创建被动拓扑；不复制 expose。 */
  acceptor(adapter: IRpcAcceptorAdapter): IAcceptor;
}

/** Entry point 2：共享 exposure、session 与 ownership 的深模块。 */
export declare function createRpc(): IRpc;
```

逐方法 `type` 不是为未来 streaming 预留的无类型 options bag，而是稳定的判别字段。Protobuf-ES 当前 descriptor 直接使用 `"unary" | "server_streaming" | "client_streaming" | "bidi_streaming"`，Connect 根据该字段导出不同的请求与返回类型；TypeScript 对这种 discriminated union 可以做 narrowing 和 exhaustive checking。[Protobuf-ES method types](https://github.com/bufbuild/protobuf-es/blob/f55f8733a732cdc9a74bef7d29b21b3edad52392/packages/protobuf/src/types.ts#L150-L232) · [Connect client mapping](https://github.com/connectrpc/connect-es/blob/f213f1a8c98d323db5a2701d319fb3aaace84a89/packages/connect/src/promise-client.ts#L31-L70) · [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

`true` 只存在于单个 method value，并在 factory 边界立即归一化；核心、wire schema 与调试输出只看完整 object。这个默认也与 gRPC 一致：request / response 都没有 `stream` 修饰的 service method 就是 unary，只有显式 `stream` 才成为 server、client 或 bidirectional streaming。[gRPC 四种 method kind](https://grpc.io/docs/what-is-grpc/core-concepts/#service-definition) 顶层 `methods: true` 不被支持，因为它会把 interface 里的所有函数无意间扩大为 wire attack surface，也无法逐方法承载未来 streaming 和 handler 能力。

这是 **HITL 待选候选**，不是已接受的规范。选择 complete-frame 单位，是为了让 WebSocket、MessagePort 等 message transport 保留原生边界；对这类 transport，本候选已经是一份完整 implementation contract。raw-byte/TCP adapter 必须自行增加/移除 framing，但在后续 ticket 决定 framing format、最大 frame size 和 buffering limits 之前，还不能称为可完整实现。RPC 实现按顺序 `await send()`，因此 adapter 不必定义并发 send ordering；`send()` 只暴露本地 admission/backpressure，不偷偷承诺远端 delivery。`end()` 等待先前 send 后 graceful 结束 outbound；`dispose()` 则是可中断 pending I/O 且不保证 flush 的 abortive teardown。ACK、协议级 flow control、重连队列与 `pendingCalls` 仍由后续 ticket 决定。

`IRpcAcceptorAdapter.listen()` 的 signal 只取消 startup；promise settle 后 adapter 停止观察它，存活 endpoint 只由返回的 listener 控制。listener 只拥有 adapter 创建的 subscription/listening resource，不拥有由使用者传入的 HTTP server；Acceptor 拥有 listener 和 `accept` 交付的 connection。Connector 拥有 `connect()` 返回的 connection。topology dispose 会 abort pending adapter work，并 dispose 自己拥有的 listener/connection；所有 `dispose()` 幂等。

内存 adapter 必须实现同一个公开 seam，而不是测试专用捷径：一对 `TransformStream<Uint8Array, Uint8Array>` 交叉连接两端；`send(frame)` 在等待 writer 前复制 `frame`，writer Promise 直接呈现本地 backpressure；`end()` close writer 以呈现 graceful completion，`dispose()` 则 cancel/abort 两端；acceptor 未 listen、重复 listen、signal 已 abort 和 connection dispose 都有可观察结果。这样测试同时验证 adapter interface 的可实现性、双向 frame 顺序和 ownership，而不会绕过 production message adapter 要承担的复杂度。完整可编译声明见[公共 interface](../user-facing-rpc-interface/public-interface.ts)，caller、内存装配与静态类型负例分别见 root-centered 的 [Connector](../user-facing-rpc-interface/root-centered/connector.usage.ts) 与 [Acceptor](../user-facing-rpc-interface/root-centered/acceptor.usage.ts)、[内存 adapter 场景](../user-facing-rpc-interface/in-memory/scenario.ts)和[类型校验示例](../user-facing-rpc-interface/type-validation.usage.ts)。WebSocket 的实际映射成本见[adapter 原型](../user-facing-rpc-interface/websocket-adapters.ts)、[浏览器 Connector](../user-facing-rpc-interface/websocket-express/connector.usage.ts)与[Express Acceptor](../user-facing-rpc-interface/websocket-express/acceptor.usage.ts)：服务端采用 `ws` 官方的 [`noServer` / `handleUpgrade` 外部 HTTP server 模式](https://github.com/websockets/ws/blob/master/README.md#multiple-servers-sharing-a-single-https-server)，借用 Express 所在的 HTTP server；浏览器端只能依据 WHATWG WebSockets 定义的 [`bufferedAmount`](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount) 轮询表达粗粒度 outbound admission；两端都必须将 push message 放入按 frame 数量和总 bytes 双限的队列，overflow 令连接失败。Node 的 [`upgrade` event](https://nodejs.org/api/http.html#event-upgrade) 直接交付 request/socket/head，不经过 Express 的普通 request-listener 路径；认证若需要，必须另有可排序且可拒绝的 upgrade seam，不能假设 Express middleware 自动生效。

### 同一组场景

```typescript
interface SearchService {
  ping(): string;
  search(query: string, signal: AbortSignal): Promise<readonly string[]>;
  localCacheSize: number; // 未选择，不可远程访问
}

const ISearch = createServiceIdentifier<SearchService>(Symbol("ISearch"));
const RemoteSearch = createRemoteServiceIdentifier(ISearch, {
  wireName: "example.search.v1",
  methods: {
    ping: true,
    search: { type: "unary", cancelable: true },
  },
});

interface ClientEvents {
  changed(key: string): void;
}

const IClientEvents = createServiceIdentifier<ClientEvents>("client-events.v1");
const RemoteClientEvents = createRemoteServiceIdentifier(IClientEvents, {
  methods: {
    changed: true,
  },
});

declare const searchService: SearchService;
declare const clientEvents: ClientEvents;
```

连接前配置、主动连接、稳定 proxy：

```typescript
const clientRpc = createRpc();
const unexposeEvents = clientRpc.expose(
  RemoteClientEvents,
  clientEvents,
);

const connector = clientRpc.connector(
  createWebSocketConnectorAdapter({ url: "wss://example.test/rpc" }),
);
const search = connector.peer.resolve(RemoteSearch); // 尚未 connect 也可拿到

await connector.connect();
await search.ping(); // string -> Promise<string>

// Physical Connection 暂时断开：
await search.ping(); // reject RpcError(unavailable)，不进入隐藏队列

// 同一 Logical Session 重连后：不重新 expose、取 peer 或取 proxy。
await search.ping();
```

被动监听、双向调用、全部 peer 与部分失败：

```typescript
const serverRpc = createRpc();
serverRpc.expose(RemoteSearch, searchService);

const acceptor = serverRpc.acceptor(
  createWebSocketAcceptorAdapter({ server: httpServer }),
);
const allClients = acceptor.resolveAll(RemoteClientEvents); // listen 前即可拿到

await acceptor.listen();

// 任一 accepted peer 都具有同一种对称能力。
await acceptor.peers[0]?.resolve(RemoteClientEvents).changed("one");

const results = await allClients.changed("all");
for (const result of results) {
  if (result.status === RpcBatchResultStatusEnum.fulfilled) {
    console.log("delivered to", result.peer);
  } else {
    console.warn("failed for", result.peer, result.reason.code);
  }
}
```

取消与 cleanup：

```typescript
const controller = new AbortController();
const pending = search.search("husky", controller.signal);
controller.abort();

await pending; // reject RpcError(canceled)
// exposed SearchService.search() 收到的 AbortSignal 也会被 signal；它仍须协作停止。

unexposeEvents();
unexposeEvents(); // 幂等
connector.dispose();
connector.dispose(); // 幂等；其 peer/proxy 进入 disposed
acceptor.dispose();   // 停止接受并 dispose 其 peers
clientRpc.dispose();  // 兜底 dispose 自己创建且仍存活的 topology/exposure
serverRpc.dispose();
```

## 精确行为与 ordering

- `createRemoteServiceIdentifier()` 在 TypeScript 层验证：`methods` 必须是逐方法 object map，key 只能是 `T` 的函数成员且不能有多余 key；value 只能是 `true` 或当前 method kind 对应的 discriminated configuration；`cancelable: true` 只允许在本地 handler 有且只有一个必填尾随 `AbortSignal` 时使用，反过来含直接 `AbortSignal` 参数的方法也不能使用 `true` / `cancelable: false`，避免把控制参数误编码成 wire payload。`true` 保留字面量推断，并等价于 `{ type: "unary", cancelable: false }`。未来增加 streaming kind 时，其参数与返回流形态也必须由对应 union member 校验，不能只检查字符串。
- factory 同时做运行时验证，覆盖纯 JavaScript、`any` 和 assertion 绕过：`methods` 必须是非 null、非 array、至少一个 own string key 的 object；value 必须严格为 `true`，或只含已知字段且精确满足 `{ type: "unary", cancelable: boolean }` 的完整 object。factory 立即把 `true` shorthand 归一化并冻结结果；不接受顶层 `methods: true`、未知 method kind、缺失/非 boolean `cancelable`、symbol key、空 map、constructor/symbol identifier 缺少 `wireName` 或空 `wireName`。失败同步抛带精确 property path 的 `TypeError`。string identifier 默认以自身为 Wire Service Name。TypeScript interface 在运行时已擦除，因此 factory 不能声称验证 key 属于 `T`。
- `IRpc.expose()` 同步验证重复 Wire Service Name、已 disposed root、无效 implementation，以及 descriptor 中每个 method key 在 implementation 上确实解析为 function；这样纯 JavaScript 调用仍会在暴露阶段得到 runtime validation。失败不留下部分 exposure。RPC 借用 implementation，不随 exposure cleanup 或 root dispose 销毁它。成功返回幂等 `Cleanup`；cleanup 返回后，新到达的 call 不再 dispatch，已经 dispatch 的 call 允许自然结束。
- exposure 与 topology 正交：一次 exposure 对该 root 创建的所有当前和未来 peer 生效；Connector/Acceptor 不提供同义方法。
- `resolve()` / `resolveAll()` 只建立稳定 proxy/group handle，不进行网络 I/O、不要求远端当时已 expose，也不排队调用。
- Connector 是 `IRpcConnectorAdapter.connect(signal)` 的唯一调用者，同一 adapter 上不并发调用；首连或重连返回的 connection 由 Connector 接管。pending connect 被 topology dispose abort，已取得的 connection 被 dispose。
- Acceptor 对一个 `IRpcAcceptorAdapter` 只调用一次 `listen(accept, signal)`；signal 仅覆盖 startup，promise settle 后 adapter 停止观察它。ready 前的 failure 由 `listen()` reject，ready 后的 listener failure 由 `listener.closed` reject。每个交给 `accept` 的 connection 立即转由 Acceptor 接管。
- `frames` 只能被 RPC 单次消费，按 transport 顺序产生完整 frame；正常远端关闭结束 iteration，transport failure 令 iteration throw。每次 yield 把一个稳定 buffer 转移给 RPC，adapter 此后不能 mutate 或复用它。无法暂停 source 的 push adapter 必须使用 bounded buffer，overflow 直接令 connection fail；无界 private queue 不合法。
- message transport 保留自己的消息边界，因此 framed-pull seam 对它们已完整。raw-byte/TCP adapter 要负责 framing/reassembly，但在后续 ticket 指定 framing format、最大 frame size 与 buffering limits 前还不能完整实现。
- RPC 顺序 `await connection.send(frame)`；fulfillment 仅表示 adapter 已消费 caller buffer 并完成本地 admission/backpressure。远端 delivery、decode、ACK 和协议级 flow control 都不能从这个 Promise 推断。
- `end()` flush 先前 send 并 intentional graceful shutdown outbound；`dispose()` 是同步、abortive teardown，不保证 flush。没有 half-close 的 transport 可让 `end()` 关闭双向。
- `Connector.peer` 自 connector 创建起 identity 不变。`connect()` 的并发调用合并为同一次首连；首连失败通过 Promise reject，之后可再次调用；Logical Session 建立后的瞬时重连由实现维护。
- `Acceptor.peers` 每次读取产生普通数组；元素按 Logical Session 首次接受顺序排列，终止 session 被移除，存活元素相对顺序不变。
- group method 在调用瞬间读取一次 `peers` snapshot，按 snapshot 顺序并发发起；等待每项 settle，不因单项失败 short-circuit；结果数组与 snapshot 等长、同序，并在每项中保留原 `peer`。
- single-peer proxy method 在调用时没有可用 Physical Connection，reject `unavailable`；连接在 call 已 dispatch 后丢失且无终态，reject `interrupted`，表示远端是否产生副作用未知。
- caller 的 `AbortSignal` 先赢得终态时，reject `canceled`；当且仅当该 method descriptor 是 `cancelable: true`，runtime 才向用户 handler 注入并 signal 一个尾随 `AbortSignal`。这里的 flag 描述 handler invocation ABI，不是 wire cancellation capability：协议可以终止任意 in-flight call，即使 noncancelable handler 不接收 signal。取消是 cooperative，不能证明 handler 未执行或副作用已回滚。group abort 仍 fulfill 整个结果数组，每个尚未 settle 的 peer 产生自己的 `canceled` result。
- 远端 application throw 归一为 `RpcError(remote)`，只承诺 `RemoteError.name/message`；version skew 的未知 contract/method 分别为 `unknownService` / `unknownMethod`；畸形消息或不变量破坏为 `protocol`。
- factory/expose 的配置错误同步抛；所有 proxy/group method 的 unavailable、interrupted、remote、unknown、canceled、disposed 与 protocol 错误都只通过 Promise 表达。已 disposed group 自身无法形成 peer result 时，group Promise reject `disposed`。
- terminal outcome 只 settle 一次。result/error、abort、disconnect、dispose 的更细竞态优先级仍由“决定 error、cancellation 与终态竞态”锁定；本草案只要求后来的消息不得改写已 settle Promise。
- `Cleanup` 与所有 `dispose()` 幂等。root dispose 会撤销 exposure，并 dispose 它创建而尚存活的 Connector/Acceptor；topology dispose 会终止其 session handles、abort pending adapter work、dispose listener 与拥有的 connection，但不 dispose 外部 HTTP server 或 borrowed implementation。没有 `close()`、`stop()` 或 `disconnect()` 别名。

## 深度、依赖与取舍

**这个 interface 让 caller 不必理解：** request id、frame codec、registry、Physical Connection replacement、session resume token、pending-call map、cancel control message、remote error serialization、fan-out settlement、proxy release 与 adapter-specific event types。adapter author 则明确承担本地 backpressure、bounded push buffering、稳定 frame buffer 转移、监听生命周期和 transport failure 映射；raw-byte boundary 转换仍依赖后续 framing format/limits。删除 `IRpc` 后，协议/session 复杂度会重新散落到每个 Connector、Acceptor 和 call site，因此这个 module 有实际 depth；明确 adapter port 是划清职责，不是省略工作。

**依赖分类：**

- `ServiceIdentifier`、`Cleanup`、`IDisposable` 与类型映射是 in-process dependency。
- exposure 是 in-process borrowed dependency：`expose(service, implementation)` 直接接收普通对象，RPC 不拥有其销毁职责。
- transport 是 remote-but-owned seam：message transport adapter 与 in-memory adapter 是两个可按当前 contract 实现的真实 adapter。RPC implementation 拥有协议/session 逻辑；framed-pull port 明确交换稳定的完整 frame、传播 receive/overflow failure，通过 `send()` Promise 暴露本地 admission/backpressure，并用 `end()`/`dispose()` 区分 graceful 与 abortive shutdown。raw-byte/TCP 要等 framing format/limits 后才具备完整 contract。
- `AbortSignal` 是 Web Platform primitive；没有 Node/browser 专属类型穿过 caller interface。

**有意接受的代价：**

- method names 在 TypeScript interface 与逐方法 runtime descriptor map 中出现两次；这是类型擦除所迫，换来显式 exposure、版本可检查性和更小的攻击面。只为采用默认 unary/noncancelable 的方法写 `methodName: true`，避免重复默认字段，但仍须逐项 opt in。
- `cancelable: true` 的本地方法必须把 `AbortSignal` 放在最后且设为必填；remote proxy 将它变为可选。该 metadata 表示 runtime 会注入 handler control，不限制协议取消 noncancelable call。这个约束比从任意参数形状猜测 signal 更可验证，也让未来 streaming 通过同一 method descriptor 判别，而不是继续增加平行参数列表。
- 一个 root 的 exposure 作用于它创建的全部 peers；若未来确有 peer-specific exposure，再增加过滤能力。现在增加 scope/options 只会制造未经场景证明的浅 seam。
- group 等待 snapshot 中所有 peers settle；慢 peer 会延迟整体 Promise。第一版没有 streaming/progress，不能伪装成提前产出。
- peer/proxy 没有独立 `dispose()`；ownership 集中在 Connector/Acceptor，避免 Comlink 式每个 proxy 都附带 release protocol。若真实场景需要从 Acceptor 主动踢掉单个 peer，应由 lifecycle ticket证明并增加唯一语义。
- 不提供 durable handle、隐式 offline queue、业务 retry、per-call transport options、codec hooks 或 streaming placeholder；它们都没有通过当前删除测试。

## 推荐

把这个“一个 RPC root + 逐方法 descriptor map + 显式 framed-pull adapter”草案作为后续 ticket 的共同调用基线：RemoteServiceIdentifier ticket 证明 method key、`type`、handler cancellation ABI 及未来 stream shape 的类型映射可编译，并用 runtime validation 覆盖 JavaScript/`any`；exposure ticket 验证 borrowed implementation 与 cleanup；transport/lifecycle ticket 先验证 message transport、listener/connection failure、bounded buffering、graceful `end()` 与 abortive disposal；raw-byte/TCP 需在 framing format 和 limits 确定后再验证。这个结论仍等待 HITL 选择；ACK、协议级 flow control 与 `pendingCalls` 不在本票提前定型。不要退回平行的 method/cancelable arrays、顶层 `methods: true` 或 `sendRequest()` primitive，也不要恢复在 Connector/Acceptor 上复制 exposure 的 `RpcServiceRegistry` 方案。
