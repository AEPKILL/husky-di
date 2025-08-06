/**
 * @overview
 * 装饰器工厂 - 支持生成 TypeScript 和 ES 标准装饰器
 * @author AEPKILL
 * @created 2025-01-27
 */

import type {
	DecoratorMode,
	ESClassElementDecoratorContext,
	ESParameterDecoratorContext,
	TSClassDecorator,
	TSParameterDecorator,
	UnifiedClassDecorator,
	UnifiedParameterDecorator,
} from "@/types/decorator-types";
import { isESDecorator } from "./decorator-detector";

/**
 * 装饰器工厂选项
 */
export interface DecoratorFactoryOptions {
	mode?: DecoratorMode;
	forceMode?: DecoratorMode;
}

/**
 * 创建类装饰器工厂
 * @param tsDecorator TypeScript 装饰器实现
 * @param esDecorator ES 装饰器实现
 * @param options 工厂选项
 * @returns 统一的类装饰器
 */
export function createClassDecorator(
	tsDecorator: TSClassDecorator,
	esDecorator: (element: any, context: ESClassElementDecoratorContext) => any,
	options: DecoratorFactoryOptions = {},
): UnifiedClassDecorator {
	// 如果强制指定模式，直接返回对应实现
	if (options.forceMode) {
		return options.forceMode === "es" ? esDecorator : tsDecorator;
	}

	// 返回一个统一的装饰器函数，在运行时检测模式
	return function unifiedDecorator(target: any, context?: any) {
		// 检查第一个参数是否为 ES 装饰器上下文
		if (isESDecorator(context)) {
			// ES 装饰器模式
			return esDecorator(target, context as ESClassElementDecoratorContext);
		} else {
			// TypeScript 装饰器模式
			return tsDecorator(target);
		}
	} as UnifiedClassDecorator;
}

/**
 * 创建参数装饰器工厂
 * @param tsDecorator TypeScript 参数装饰器实现
 * @param esDecorator ES 参数装饰器实现
 * @param options 工厂选项
 * @returns 统一的参数装饰器
 */
export function createParameterDecorator(
	tsDecorator: TSParameterDecorator,
	esDecorator: (element: any, context: ESParameterDecoratorContext) => any,
	options: DecoratorFactoryOptions = {},
): UnifiedParameterDecorator {
	// 如果强制指定模式，直接返回对应实现
	if (options.forceMode) {
		return options.forceMode === "es" ? esDecorator : tsDecorator;
	}

	// 返回一个统一的装饰器函数，在运行时检测模式
	return function unifiedDecorator(
		target: any,
		propertyKey?: any,
		parameterIndex?: any,
	) {
		// 检查第一个参数是否为 ES 装饰器上下文
		if (isESDecorator(target)) {
			// ES 装饰器模式
			return esDecorator(target, target as ESParameterDecoratorContext);
		} else {
			// TypeScript 装饰器模式
			return tsDecorator(target, propertyKey, parameterIndex);
		}
	} as UnifiedParameterDecorator;
}
