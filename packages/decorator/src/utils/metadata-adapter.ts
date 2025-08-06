/**
 * @overview
 * 元数据访问适配器 - 统一 TypeScript 和 ES 装饰器的元数据访问
 * @author AEPKILL
 * @created 2025-01-27
 */

import type { DecoratorMode, MetadataAccessor } from "@/types/decorator-types";
import { detectDecoratorMode } from "./decorator-detector";

/**
 * TypeScript 模式的元数据访问器
 */
class TypeScriptMetadataAccessor implements MetadataAccessor {
	getMetadata(key: string | symbol, target: any): any {
		if (
			typeof Reflect !== "undefined" &&
			typeof Reflect.getMetadata === "function"
		) {
			return Reflect.getMetadata(key, target);
		}
		return undefined;
	}

	setMetadata(key: string | symbol, value: any, target: any): void {
		if (
			typeof Reflect !== "undefined" &&
			typeof Reflect.defineMetadata === "function"
		) {
			Reflect.defineMetadata(key, value, target);
		}
	}

	hasMetadata(key: string | symbol, target: any): boolean {
		if (
			typeof Reflect !== "undefined" &&
			typeof Reflect.hasMetadata === "function"
		) {
			return Reflect.hasMetadata(key, target);
		}
		return false;
	}
}

/**
 * ES 模式的元数据访问器
 */
class ESMetadataAccessor implements MetadataAccessor {
	getMetadata(key: string | symbol, target: any): any {
		// ES 装饰器通过 context.metadata 访问
		// 这里需要根据具体实现调整
		return target?.metadata?.[key];
	}

	setMetadata(key: string | symbol, value: any, target: any): void {
		if (!target.metadata) {
			target.metadata = {};
		}
		target.metadata[key] = value;
	}

	hasMetadata(key: string | symbol, target: any): boolean {
		return target?.metadata?.[key] !== undefined;
	}
}

/**
 * 获取元数据访问器
 * @param mode 装饰器模式
 * @returns 元数据访问器
 */
export function getMetadataAccessor(mode?: DecoratorMode): MetadataAccessor {
	const detectedMode = mode || detectDecoratorMode();

	switch (detectedMode) {
		case "es":
			return new ESMetadataAccessor();
		default:
			return new TypeScriptMetadataAccessor();
	}
}

/**
 * 全局元数据访问器实例
 */
export const metadataAccessor = getMetadataAccessor();
