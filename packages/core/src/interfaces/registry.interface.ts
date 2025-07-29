/**
 * @overview
 * @author AEPKILL
 * @created 2023-10-10 10:58:30
 * @description 注册表接口，用于管理服务注册信息
 *
 */

import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { IRegistration } from "./registration.interface";

export interface IRegistry {
	get<T>(serviceIdentifier: ServiceIdentifier<T>): undefined | IRegistration<T>;

	getAll<T>(serviceIdentifier: ServiceIdentifier<T>): Array<IRegistration<T>>;

	has<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;

	set<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: IRegistration<T>,
	): void;

	setAll<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registrations: Array<IRegistration<T>>,
	): void;

	remove<T>(serviceIdentifier: ServiceIdentifier<T>): void;

	clear(): void;
}
