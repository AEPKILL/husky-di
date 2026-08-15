/**
 * @overview @husky-di/remote 设计示例——远程方法 interface 的编译期校验用例。
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import type { Observable } from "rxjs";

import type { SessionService } from "./fixtures";
import { IClientEvents, ISession } from "./fixtures";
import {
	createRemoteServiceIdentifier,
	type IConnection,
	type IRpcAcceptor,
	type IRpcAcceptorAdapter,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcPeer,
	type RpcMethodDefinitions,
	type RpcPeerResult,
	type RpcUnaryMethodDefinition,
	type ServiceIdentifier,
} from "./rpc-interface";

interface SpecialSignal extends AbortSignal {
	readonly special: true;
}

interface InvalidSpecialSignalService {
	run(signal: SpecialSignal): void;
}

interface InvalidObservableHandlerService {
	run(): string | Promise<Observable<string>>;
}

declare const typeValidationPeer: IRpcPeer;
declare const typeValidationAcceptor: IRpcAcceptor;
declare const typeValidationAcceptorAdapter: IRpcAcceptorAdapter;
declare const typeValidationConnector: IRpcConnector;
declare const typeValidationConnectorAdapter: IRpcConnectorAdapter;

/** 本函数只供 TypeScript 编译期探测，绝不应被调用。 */
export function typeValidationUsage(): void {
	const shorthandDescriptor = createRemoteServiceIdentifier(ISession, {
		methods: { ping: true },
	});
	const shorthandRemote = typeValidationPeer.resolve(shorthandDescriptor);
	const pingResult: Promise<boolean> = shorthandRemote.ping();
	void pingResult;
	// @ts-expect-error 精确 map 没有选择 login，proxy 不得暴露该方法。
	void shorthandRemote.login;

	createRemoteServiceIdentifier(ISession, {
		methods: { ping: { type: "unary", cancelable: false } },
	});
	createRemoteServiceIdentifier(ISession, {
		methods: { ping: { type: "unary" } },
	});
	createRemoteServiceIdentifier(IClientEvents, {
		methods: { changed: { type: "unary" } },
	});

	const annotatedPing: RpcUnaryMethodDefinition<SessionService["ping"]> = {
		type: "unary",
	};
	createRemoteServiceIdentifier(ISession, {
		methods: { ping: annotatedPing },
	});

	const checkedMethods = {
		ping: { type: "unary" },
	} satisfies RpcMethodDefinitions<SessionService>;
	const checkedDescriptor = createRemoteServiceIdentifier(ISession, {
		methods: checkedMethods,
	});
	void typeValidationPeer.resolve(checkedDescriptor).ping;

	const widenedMethods: RpcMethodDefinitions<SessionService> = checkedMethods;
	const widenedDescriptor = createRemoteServiceIdentifier(ISession, {
		methods: widenedMethods,
	});
	const widenedRemote = typeValidationPeer.resolve(widenedDescriptor);
	// @ts-expect-error Partial 的 optional key 不能被当成确定选择的方法。
	void widenedRemote.ping;

	const cancelableDescriptor = createRemoteServiceIdentifier(ISession, {
		methods: { login: { type: "unary", cancelable: true } },
	});
	const cancelableRemote = typeValidationPeer.resolve(cancelableDescriptor);
	const callerSignal = new AbortController().signal;
	const loginResult: Promise<string> = cancelableRemote.login(
		"aepkill",
		"secret",
	);
	const loginWithSignalResult: Promise<string> = cancelableRemote.login(
		"aepkill",
		"secret",
		callerSignal,
	);
	void loginResult;
	void loginWithSignalResult;
	// @ts-expect-error caller cancellation 只接受 AbortSignal。
	cancelableRemote.login("aepkill", "secret", "not-a-signal");

	const remoteClientEvents = createRemoteServiceIdentifier(IClientEvents, {
		methods: { changed: true },
	});
	const batchResult: Promise<readonly RpcPeerResult<IRpcPeer, void>[]> =
		typeValidationAcceptor
			.resolveAll(remoteClientEvents)
			.changed("maintenance-scheduled");
	const cancelableBatch =
		typeValidationAcceptor.resolveAll(cancelableDescriptor);
	const cancelableBatchResult: Promise<
		readonly RpcPeerResult<IRpcPeer, string>[]
	> = cancelableBatch.login("aepkill", "secret");
	const batchWithSignalResult: Promise<
		readonly RpcPeerResult<IRpcPeer, string>[]
	> = cancelableBatch.login("aepkill", "secret", callerSignal);
	// @ts-expect-error batch caller cancellation 也只接受 AbortSignal。
	cancelableBatch.login("aepkill", "secret", "not-a-signal");
	const connectResult: Promise<void> = typeValidationConnector.connect(
		typeValidationConnectorAdapter,
	);
	const listenResult: Promise<void> = typeValidationAcceptor.listen(
		typeValidationAcceptorAdapter,
	);
	const peer$: Observable<IRpcPeer> = typeValidationAcceptor.peer$;
	const connection$: Observable<IConnection> =
		typeValidationAcceptorAdapter.connection$;
	const adapterListenResult: Promise<void> =
		typeValidationAcceptorAdapter.listen(callerSignal);
	const adapterDisposed: boolean = typeValidationAcceptorAdapter.disposed;
	void batchResult;
	void cancelableBatchResult;
	void batchWithSignalResult;
	void connectResult;
	void listenResult;
	void peer$;
	void connection$;
	void adapterListenResult;
	void adapterDisposed;
	typeValidationAcceptorAdapter.dispose();
	// @ts-expect-error 每次建连必须显式提供 connector adapter。
	typeValidationConnector.connect();
	// @ts-expect-error 首次启动必须显式提供 acceptor adapter。
	typeValidationAcceptor.listen();
	// @ts-expect-error connection 通过 connection$ 交付，listen 不再接受 callback。
	typeValidationAcceptorAdapter.listen(() => undefined, callerSignal);
	// @ts-expect-error Acceptor lifecycle terminal 由 peer$ 表达，不再公开 closed。
	void typeValidationAcceptor.closed;
	// @ts-expect-error adapter lifecycle terminal 由 connection$ 表达，不再公开 closed。
	void typeValidationAcceptorAdapter.closed;

	createRemoteServiceIdentifier(ISession, {
		methods: {
			// @ts-expect-error 显式 undefined 不是省略，无法形成稳定输入。
			ping: { type: "unary", cancelable: undefined },
		},
	});

	// @ts-expect-error methods 必须是按方法显式声明的允许列表。
	createRemoteServiceIdentifier(ISession, { methods: true });

	createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error version 不是可调用成员。
		methods: { version: true },
	});

	createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error ping 没有必需的末尾 AbortSignal 参数。
		methods: { ping: { type: "unary", cancelable: true } },
	});

	createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error login 的 AbortSignal 不得作为网络传输参数。
		methods: { login: true },
	});

	createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error 省略 cancelable 等价于 false，不能吞掉 AbortSignal。
		methods: { login: { type: "unary" } },
	});

	createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error 当前阶段尚未定义流式调用类型。
		methods: { ping: { type: "server-streaming" } },
	});

	createRemoteServiceIdentifier(ISession, {
		methods: {
			// @ts-expect-error 方法定义不接受未知属性。
			ping: { type: "unary", timeout: 1_000 },
		},
	});

	const invalidSpecialSignal =
		"invalid-special-signal" as ServiceIdentifier<InvalidSpecialSignalService>;
	createRemoteServiceIdentifier(invalidSpecialSignal, {
		// @ts-expect-error 取消信号注入要求参数类型必须恰好为 AbortSignal。
		methods: { run: { type: "unary", cancelable: true } },
	});

	const invalidObservableHandler =
		"invalid-observable-handler" as ServiceIdentifier<InvalidObservableHandlerService>;
	// @ts-expect-error Observable handler result 也必须让公开 method-definition type 归 never。
	const invalidObservableDefinition: RpcUnaryMethodDefinition<
		InvalidObservableHandlerService["run"]
	> = true;
	void invalidObservableDefinition;
	createRemoteServiceIdentifier(invalidObservableHandler, {
		// @ts-expect-error Awaited 后的 Observable 会引入未定义的 streaming 语义。
		methods: { run: true },
	});
}
