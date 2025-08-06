/**
 * @overview
 * 装饰器类型定义 - 支持 TypeScript 和 ES 标准装饰器
 * @author AEPKILL
 * @created 2025-01-27
 */

import type { Constructor, ServiceIdentifier } from "@husky-di/core";
import type { InjectionMetadata } from "./injection-metadata.type";

// TypeScript 装饰器类型
export type TSClassDecorator = (
	target: Constructor<any>,
) => void | Constructor<any>;
export type TSParameterDecorator = (
	target: Object,
	propertyKey: string | symbol | undefined,
	parameterIndex: number,
) => void;

// ES 标准装饰器类型
export type ESClassElement = {
	kind: "class";
	elements: Array<{
		kind: "field" | "method";
		key: string | symbol;
		placement: "static" | "prototype" | "own";
		descriptor?: PropertyDescriptor;
		initializer?: () => any;
	}>;
};

export type ESClassElementDecoratorContext = {
	kind: "class";
	name: string;
	addInitializer(initializer: () => void): void;
	metadata: Record<string | symbol, any>;
};

export type ESParameterDecoratorContext = {
	kind: "parameter";
	name: string;
	index: number;
	metadata: Record<string | symbol, any>;
};

// 统一装饰器类型
export type UnifiedClassDecorator =
	| TSClassDecorator
	| ((
			element: ESClassElement,
			context: ESClassElementDecoratorContext,
	  ) => ESClassElement);
export type UnifiedParameterDecorator =
	| TSParameterDecorator
	| ((element: any, context: ESParameterDecoratorContext) => any);

// 装饰器模式检测
export type DecoratorMode = "typescript" | "es";

// 元数据访问接口
export interface MetadataAccessor {
	getMetadata(key: string | symbol, target: any): any;
	setMetadata(key: string | symbol, value: any, target: any): void;
	hasMetadata(key: string | symbol, target: any): boolean;
}

// 装饰器工厂选项
export interface DecoratorFactoryOptions {
	mode?: DecoratorMode;
	metadataAccessor?: MetadataAccessor;
}
