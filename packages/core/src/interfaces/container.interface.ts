/**
 * @overview
 * @author AEPKILL
 * @created 2025-06-25 23:27:49
 */

import type { IUnique } from "@/interfaces/unique.interface";
import type { Ref } from "@/types/ref.type";

export interface IContainer extends IUnique {
	readonly name: string;
}

/**
 * 解析选项接口
 * 提供严格的类型约束：
 * - 只有当 optional 为 true 时才允许传入 defaultValue
 * - 当 multiple 为 true 时，defaultValue 必须是 T[]
 * - 当 multiple 为 false 时，defaultValue 必须是 T
 */
export type ResolveOptions<T> = {
	dynamic?: boolean;
	ref?: boolean;
} & (
	| {
			/** 不需要多个实例，且不是可选的 */
			multiple?: false;
			optional?: false;
	  }
	| {
			/** 不需要多个实例，但是可选的，可以提供单个默认值 */
			multiple?: false;
			optional: true;
			defaultValue?: T;
	  }
	| {
			/** 需要多个实例，但不是可选的 */
			multiple: true;
			optional?: false;
	  }
	| {
			/** 需要多个实例，且是可选的，可以提供数组默认值 */
			multiple: true;
			optional: true;
			defaultValue?: T[];
	  }
);
