/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:17:41
 */

import type { Constructor } from "@/types/constructor.type";

/**
 * 服务标识符类型
 *
 * 用于标识和定位服务的联合类型，支持三种形式的标识符：
 * - 构造函数：直接使用类构造函数作为标识符
 * - 字符串：使用字符串作为服务的唯一标识
 * - Symbol：使用 Symbol 作为服务的唯一标识，避免命名冲突
 *
 * @template T 服务实例的类型
 *
 * @example
 * ```typescript
 * // 使用构造函数作为标识符
 * class UserService {}
 * const userServiceId: ServiceIdentifier<UserService> = UserService;
 *
 * // 使用字符串作为标识符
 * const apiServiceId: ServiceIdentifier<ApiService> = 'api-service';
 *
 * // 使用 Symbol 作为标识符
 * const loggerServiceId: ServiceIdentifier<Logger> = Symbol('logger');
 * ```
 */
export type ServiceIdentifier<T> = Constructor<T> | string | symbol;

/**
 * 从服务标识符类型中提取实例类型
 *
 * 这个工具类型用于从 ServiceIdentifier<T> 中提取出实例类型 T。
 * 它通过条件类型来推断 ServiceIdentifier 的泛型参数。
 *
 * @template R 扩展自 ServiceIdentifier 的类型
 * @returns 从 ServiceIdentifier 中提取的实例类型 T
 *
 * @example
 * ```typescript
 * class UserService {
 *   name: string = 'user';
 * }
 *
 * // 从 ServiceIdentifier 类型中提取实例类型
 * type UserInstance = ServiceIdentifierInstance<ServiceIdentifier<UserService>>; // UserService
 *
 * // 从构造函数类型中提取实例类型
 * type DirectInstance = ServiceIdentifierInstance<typeof UserService>; // UserService
 *
 * // 应用场景：在依赖注入中获取服务实例类型
 * function getService<T>(identifier: ServiceIdentifier<T>): ServiceIdentifierInstance<typeof identifier> {
 *   // 实现逻辑...
 * }
 * ```
 */
export type ServiceIdentifierInstance<R extends ServiceIdentifier<unknown>> =
	R extends ServiceIdentifier<infer T> ? T : never;
