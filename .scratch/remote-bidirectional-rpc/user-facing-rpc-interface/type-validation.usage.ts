/**
 * @overview 仅用于原型验证——远程方法的编译期校验用例。
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import type { SessionService } from "./fixtures";
import { IClientEvents, ISession } from "./fixtures";
import type {
	RpcMethodDefinitions,
	RpcUnaryMethodDefinition,
	ServiceIdentifier,
} from "./public-interface";
import {
	ContractCentered,
	FunctionalSeams,
	RootCentered,
} from "./public-interface";

interface SpecialSignal extends AbortSignal {
	readonly special: true;
}

interface InvalidSpecialSignalService {
	run(signal: SpecialSignal): void;
}

declare const typeValidationPeer: RootCentered.IRpcPeer;

/**
 * `cancelable` 是处理器的注入元数据：省略时默认为 false；值为 true 时，实现方法
 * 必须以一个 AbortSignal 作为末尾参数，而代理方法会将该参数变为可选。本函数只用于
 * 编译期探测，绝不应被调用。
 */
export function typeValidationUsage(): void {
	const shorthandDescriptor = RootCentered.createRemoteServiceIdentifier(
		ISession,
		{
			methods: { ping: true },
		},
	);
	const shorthandCancelable: false =
		shorthandDescriptor.methods.ping.cancelable;
	void shorthandCancelable;

	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: { ping: { type: "unary", cancelable: false } },
	});

	const defaultedDescriptor = RootCentered.createRemoteServiceIdentifier(
		ISession,
		{
			methods: { ping: { type: "unary" } },
		},
	);
	const defaultedCancelable: false =
		defaultedDescriptor.methods.ping.cancelable;
	void defaultedCancelable;

	RootCentered.createRemoteServiceIdentifier(IClientEvents, {
		methods: { changed: { type: "unary" } },
	});

	const annotatedPing: RpcUnaryMethodDefinition<SessionService["ping"]> = {
		type: "unary",
	};
	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: { ping: annotatedPing },
	});

	const checkedMethods = {
		ping: { type: "unary" },
	} satisfies RpcMethodDefinitions<SessionService>;
	const checkedDescriptor = RootCentered.createRemoteServiceIdentifier(
		ISession,
		{
			methods: checkedMethods,
		},
	);
	const checkedRemote = typeValidationPeer.resolve(checkedDescriptor);
	void checkedRemote.ping;
	// @ts-expect-error 精确 map 没有选择 login，proxy 不得暴露该方法。
	void checkedRemote.login;

	const widenedMethods: RpcMethodDefinitions<SessionService> = checkedMethods;
	const widenedDescriptor = RootCentered.createRemoteServiceIdentifier(
		ISession,
		{
			methods: widenedMethods,
		},
	);
	const widenedRemote = typeValidationPeer.resolve(widenedDescriptor);
	// @ts-expect-error Partial 的 optional key 不能被当成确定选择的方法。
	void widenedRemote.ping;

	const cancelableDescriptor = RootCentered.createRemoteServiceIdentifier(
		ISession,
		{
			methods: { login: { type: "unary", cancelable: true } },
		},
	);
	const normalizedCancelable: true =
		cancelableDescriptor.methods.login.cancelable;
	void normalizedCancelable;

	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: {
			// @ts-expect-error 显式 undefined 不是省略，无法形成稳定的规范化输入。
			ping: { type: "unary", cancelable: undefined },
		},
	});

	// @ts-expect-error methods 必须是按方法显式声明的允许列表。
	RootCentered.createRemoteServiceIdentifier(ISession, { methods: true });

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error version 不是可调用成员。
		methods: { version: true },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error ping 没有必需的末尾 AbortSignal 参数。
		methods: { ping: { type: "unary", cancelable: true } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error login 的 AbortSignal 不得作为网络传输参数。
		methods: { login: true },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error 省略 cancelable 等价于 false，不能吞掉 handler 的 AbortSignal。
		methods: { login: { type: "unary" } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error 当前阶段尚未定义流式调用类型。
		methods: { ping: { type: "server-streaming" } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: {
			// @ts-expect-error 方法定义不接受未知属性。
			ping: { type: "unary", timeout: 1_000 },
		},
	});

	ContractCentered.createRemoteContract(ISession, {
		methods: {
			// @ts-expect-error 所有草案共用严格的方法定义校验。
			ping: { type: "unary", cancelable: false, timeout: 1_000 },
		},
	});

	FunctionalSeams.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error 所有草案都会拒绝不可调用的键。
		methods: { version: true },
	});

	const invalidSpecialSignal =
		"invalid-special-signal" as ServiceIdentifier<InvalidSpecialSignalService>;
	RootCentered.createRemoteServiceIdentifier(invalidSpecialSignal, {
		// @ts-expect-error 取消信号注入要求参数类型必须恰好为 AbortSignal。
		methods: { run: { type: "unary", cancelable: true } },
	});
}
