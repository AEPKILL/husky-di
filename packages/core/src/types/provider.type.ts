/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-23 19:59:55
 */

import type { LifecycleEnum } from "@/enums/lifecycle.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type { Constructor } from "@/types/constructor.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type ProviderBase = {
	readonly lifecycle: LifecycleEnum;
};

export type ClassProvider<T> = ProviderBase & {
	readonly useClass: Constructor<T>;
};

export type ValueProvider<T> = ProviderBase & {
	readonly useValue: T;
};

export type FactoryProvider<T> = ProviderBase & {
	readonly useFactory: () => T;
};

export type AliasProvider<T> = ProviderBase & {
	readonly useAlias: ServiceIdentifier<T>;
	readonly container?: IContainer;
};

export type Provider<T> =
	| ClassProvider<T>
	| ValueProvider<T>
	| FactoryProvider<T>
	| AliasProvider<T>;
