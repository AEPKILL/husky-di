/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-27 21:03:11
 */

import type { IRegistration } from "@/interfaces/registration.interface";
import type { IRegistry } from "@/interfaces/registry.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * 服务注册表实现类
 * 用于管理依赖注入容器的服务注册信息
 */
export class Registry implements IRegistry {
	/**
	 * 存储服务注册信息的 Map
	 * key: ServiceIdentifier, value: Registration[]
	 */
	private readonly _registrationMap = new Map<
		ServiceIdentifier<unknown>,
		Array<IRegistration<unknown>>
	>();

	/**
	 * 获取指定服务的注册信息
	 * @param serviceIdentifier 服务标识符
	 * @returns 服务注册信息
	 */
	get<T>(
		serviceIdentifier: ServiceIdentifier<T>,
	): IRegistration<T> | undefined {
		const registrations = this._registrationMap.get(serviceIdentifier);
		if (registrations && registrations.length > 0) {
			return registrations[registrations.length - 1] as IRegistration<T>;
		}
		return undefined;
	}

	/**
	 * 获取所有已注册的服务信息
	 * @returns 所有服务注册信息的数组
	 */
	getAll<T>(serviceIdentifier: ServiceIdentifier<T>): Array<IRegistration<T>> {
		const registrations = this._registrationMap.get(serviceIdentifier);
		return registrations ? (registrations as Array<IRegistration<T>>) : [];
	}

	/**
	 * 检查指定服务是否已注册
	 * @param serviceIdentifier 服务标识符
	 * @returns 是否已注册
	 */
	has<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
		return this._registrationMap.has(serviceIdentifier);
	}

	/**
	 * 设置服务注册信息
	 * @param serviceIdentifier 服务标识符
	 * @param registration 服务注册信息
	 */
	set<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: IRegistration<T>,
	): void {
		const registrations = [
			...(this._registrationMap.get(serviceIdentifier) || []),
			registration,
		];
		this._registrationMap.set(serviceIdentifier, registrations);
	}

	/**
	 * 批量设置服务注册信息
	 * @param registrations 服务注册信息数组
	 */
	setAll<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registrations: Array<IRegistration<T>>,
	): void {
		this._registrationMap.set(serviceIdentifier, registrations);
	}

	/**
	 * 移除指定服务的注册信息
	 * @param serviceIdentifier 服务标识符
	 */
	remove<T>(serviceIdentifier: ServiceIdentifier<T>): void {
		this._registrationMap.delete(serviceIdentifier);
	}

	/**
	 * 清空所有注册信息
	 */
	clear(): void {
		this._registrationMap.clear();
	}

	/**
	 * 获取所有已注册的服务标识符
	 * @returns 服务标识符数组
	 */
	keys(): ServiceIdentifier<unknown>[] {
		return Array.from(this._registrationMap.keys());
	}
}
