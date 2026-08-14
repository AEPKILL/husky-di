/**
 * @overview 仅用于原型验证——暂定远程方法 interface 的编译期校验用例。
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import type { SessionService } from "./fixtures";
import { IClientEvents, ISession } from "./fixtures";
import {
	createRemoteServiceIdentifier,
	type IRpcPeer,
	type RpcMethodDefinitions,
	type RpcUnaryMethodDefinition,
	type ServiceIdentifier,
} from "./rpc-interface";

interface SpecialSignal extends AbortSignal {
	readonly special: true;
}

interface InvalidSpecialSignalService {
	run(signal: SpecialSignal): void;
}

declare const typeValidationPeer: IRpcPeer;

/** 本函数只供 TypeScript 编译期探测，绝不应被调用。 */
export function typeValidationUsage(): void {
	const shorthandDescriptor = createRemoteServiceIdentifier(ISession, {
		methods: { ping: true },
	});
	const shorthandRemote = typeValidationPeer.resolve(shorthandDescriptor);
	void shorthandRemote.ping;
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
	void typeValidationPeer
		.resolve(cancelableDescriptor)
		.login("aepkill", "secret");

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
}
