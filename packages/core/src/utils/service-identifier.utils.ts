/**
 * @overview 服务标识符工具函数
 * @author AEPKILL
 * @created 2025-06-24 23:06:55
 */

import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * 创建服务标识符
 * 将字符串或Symbol转换为类型安全的ServiceIdentifier
 *
 * @template T 服务类型
 * @param id 标识符，可以是字符串或Symbol
 * @returns 类型安全的服务标识符
 *
 * @example
 * ```typescript
 * const UserService = createServiceIdentifier<IUserService>('UserService');
 * const TokenSymbol = createServiceIdentifier<string>(Symbol('token'));
 * ```
 */
export function createServiceIdentifier<T>(
	id: string | symbol,
): ServiceIdentifier<T> {
	return id as ServiceIdentifier<T>;
}

/**
 * 检查值是否为有效的服务标识符
 * 类型守卫函数，用于运行时类型检查
 *
 * @template T 服务类型
 * @param serviceIdentifier 待检查的值
 * @returns 如果是有效的服务标识符返回true，否则返回false
 *
 * @example
 * ```typescript
 * if (isServiceIdentifier(someValue)) {
 *   // someValue 现在被推断为 ServiceIdentifier<T>
 *   console.log('This is a valid service identifier');
 * }
 * ```
 */
export function isServiceIdentifier<T>(
	serviceIdentifier: unknown,
): serviceIdentifier is ServiceIdentifier<T> {
	return (
		typeof serviceIdentifier === "function" ||
		typeof serviceIdentifier === "symbol" ||
		typeof serviceIdentifier === "string"
	);
}

/**
 * 获取服务标识符的可读名称
 * 从不同类型的服务标识符中提取可读的字符串名称
 *
 * @param serviceIdentifier 服务标识符
 * @returns 服务标识符的字符串表示
 *
 * @example
 * ```typescript
 * const name1 = getServiceIdentifierName('UserService'); // 'UserService'
 * const name2 = getServiceIdentifierName(Symbol('token')); // 'Symbol(token)'
 * const name3 = getServiceIdentifierName(MyClass); // 'MyClass'
 * ```
 */
export function getServiceIdentifierName(
	serviceIdentifier: ServiceIdentifier<unknown>,
): string {
	if (typeof serviceIdentifier === "function") {
		return serviceIdentifier.name || "Anonymous";
	}

	if (typeof serviceIdentifier === "symbol") {
		return serviceIdentifier.description || serviceIdentifier.toString();
	}

	return serviceIdentifier;
}
