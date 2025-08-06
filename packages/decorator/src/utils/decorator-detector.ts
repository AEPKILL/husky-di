/**
 * @overview
 * 装饰器模式检测工具
 * @author AEPKILL
 * @created 2025-01-27
 */

import type { DecoratorMode } from "@/types/decorator-types";

/**
 * 检测是否为 ES 2023 装饰器
 * ES 装饰器的第一个参数是 context 对象，包含 kind 属性
 * @param context 装饰器上下文参数
 * @returns 是否为 ES 装饰器
 */
export function isESDecorator(
	context: any,
): context is { kind: string; name: string | symbol } {
	return typeof context === "object" && typeof context.kind === "string";
}

/**
 * 检测当前环境支持的装饰器模式
 * 注意：这个函数需要在装饰器内部调用才能准确检测
 * @returns 支持的装饰器模式
 */
export function detectDecoratorMode(): DecoratorMode {
	// 默认使用 TypeScript 模式
	// 实际的模式检测应该在装饰器函数内部进行
	return "typescript";
}

/**
 * 在装饰器内部检测模式
 * @param firstParam 装饰器的第一个参数
 * @returns 装饰器模式
 */
export function detectDecoratorModeFromParams(firstParam: any): DecoratorMode {
	if (isESDecorator(firstParam)) {
		return "es";
	}
	return "typescript";
}

/**
 * 检查是否支持 reflect-metadata
 * @returns 是否支持 reflect-metadata
 */
export function supportsReflectMetadata(): boolean {
	return (
		typeof Reflect !== "undefined" &&
		typeof Reflect.getMetadata === "function" &&
		typeof Reflect.defineMetadata === "function"
	);
}

/**
 * 获取当前装饰器配置
 * @returns 装饰器配置信息
 */
export function getDecoratorConfig() {
	const hasReflectMetadata = supportsReflectMetadata();

	return {
		mode: detectDecoratorMode(),
		supportsReflectMetadata: hasReflectMetadata,
		supportsESDecorators: false, // 需要在装饰器内部检测
		environment: {
			nodeVersion:
				typeof process !== "undefined" ? process.versions?.node : undefined,
			isBrowser: typeof globalThis !== "undefined" && "window" in globalThis,
			isDeno: typeof globalThis !== "undefined" && "Deno" in globalThis,
		},
	};
}
