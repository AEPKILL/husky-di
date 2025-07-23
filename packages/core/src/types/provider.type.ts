/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-23 19:59:55
 */

import type { LifecycleEnum } from "@/enums/lifecycle.enum";
import type { Constructor } from "./constructor.type";
import type { ServiceIdentifier } from "./service-identifier.type";

export type ProviderBase = {
	lifecycle: LifecycleEnum;
};

export type ClassProvider<T> = ProviderBase & {
	useClass: Constructor<T>;
};

export type ValueProvider<T> = ProviderBase & {
	useValue: T;
};

export type FactoryProvider<T> = ProviderBase & {
	useFactory: () => T;
};

export type AliasProvider<T> = ProviderBase & {
	useAlias: ServiceIdentifier<T>;
};

export type Provider<T> =
	| ClassProvider<T>
	| ValueProvider<T>
	| FactoryProvider<T>
	| AliasProvider<T>;
