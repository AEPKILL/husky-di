/**
 * @overview 仅用于原型验证——远程方法的编译期校验用例。
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import { ISession } from "./fixtures";
import type { ServiceIdentifier } from "./public-interface";
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

/**
 * `cancelable` 是处理器的注入元数据：值为 true 时，实现方法必须以一个 AbortSignal
 * 作为末尾参数，而代理方法会将该参数变为可选。本函数只用于编译期探测，绝不应被调用。
 */
export function typeValidationUsage(): void {
	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: { ping: true },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: { ping: { type: "unary", cancelable: false } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error 只有 `true` 会补全“一元调用且不可取消”的默认值。
		methods: { ping: { type: "unary" } },
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
