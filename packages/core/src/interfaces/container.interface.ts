/**
 * @overview
 * @author AEPKILL
 * @created 2025-06-25 23:27:49
 */

import type { IUnique } from "@/interfaces/unique.interface";
import type { Ref } from "@/types/ref.type";

/**
 * ResolveOptions:
 * - 只有当 optional 为 true 时才允许传入 defaultValue
 * - 当 multiple 为 true 时，defaultValue 必须是 T[]
 * - 当 multiple 为 false 时，defaultValue 必须是 T
 */
export type ResolveOptions<T> = {
	dynamic?: boolean;
	ref?: boolean;
} & ( // 不需要多个实例，且不是可选的，不能有 defaultValue
	| {
			multiple?: false;
			optional?: false;
			defaultValue?: never;
	  }
	// 不需要多个实例，但是可选，可以有单个 defaultValue
	| {
			multiple?: false;
			optional: true;
			defaultValue?: T;
	  }
	// 需要多个实例，但不是可选的，不能有 defaultValue
	| {
			multiple: true;
			optional?: false;
			defaultValue?: never;
	  }
	// 需要多个实例，且是可选的，可以有数组 defaultValue
	| {
			multiple: true;
			optional: true;
			defaultValue?: T[];
	  }
);

/**
 * 判断是否为数组类型
 * @param T 实例类型
 * @param O 选项类型
 */
type ResolveArrayType<T, O extends ResolveOptions<T>> = O extends {
	multiple: true;
}
	? T[]
	: T;

/**
 * 判断是否为 optional 且无 defaultValue
 * @param T 实例类型
 * @param O 选项类型
 */
type ResolveOptionalType<T, O extends ResolveOptions<T>> = O extends {
	optional: true;
	defaultValue?: undefined;
}
	? ResolveArrayType<T, O> | undefined
	: ResolveArrayType<T, O>;

/**
 * 判断是否需要 Ref 包裹
 * @param T 实例类型
 * @param O 选项类型
 */
type ResolveRefType<T, O extends ResolveOptions<any>> = O extends
	| { ref: true }
	| { dynamic: true }
	? Ref<T>
	: T;

/**
 * 根据 ResolveOptions 推导返回类型
 * @param T 实例类型
 * @param O 选项类型
 */
export type ResolveInstance<T, O extends ResolveOptions<T>> = ResolveRefType<
	ResolveOptionalType<T, O>,
	O
>;

export interface IContainer extends IUnique {
	readonly name: string;
}
