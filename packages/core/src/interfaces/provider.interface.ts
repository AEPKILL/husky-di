/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:20:39
 */

import type { LifecycleEnum } from "@/enums/lifecycle.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type { IDerivation } from "@/interfaces/derivation.interface";
import type { Constructor } from "@/types/constructor.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export interface ProviderOptions {
	readonly lifecycle?: LifecycleEnum;
}

export interface ProviderResolveOptions {
	readonly container: IContainer;
	readonly resolveContext: ResolveContext;
}

export interface IProvider<T> extends IDerivation<IProvider<T>> {
	readonly lifecycle: LifecycleEnum;
	readonly instance: T | undefined;
	readonly resolved: boolean;
	readonly registered: boolean;

	resolve(options: ProviderResolveOptions): T;
}

export interface IInternalProvider<T> extends IProvider<T> {
	setInstance(instance: T): void;
	setResolved(resolved: boolean): void;
	setRegistered(registered: boolean): void;
}

export interface ClassProviderOptions<T> extends ProviderOptions {
	readonly useClass: Constructor<T>;
}

export interface FactoryProviderOptions<T> extends ProviderOptions {
	readonly useFactory: (
		container: IContainer,
		resolveContext: ResolveContext,
	) => T;
}

export interface ValueProviderOptions<T> extends ProviderOptions {
	readonly useValue: T;
}

export interface AliasProviderOptions<T> extends ProviderOptions {
	readonly useAlias: ServiceIdentifier<T>;
	readonly container?: IContainer;
}

export type CreateProviderOptions<T> =
	| ClassProviderOptions<T>
	| FactoryProviderOptions<T>
	| ValueProviderOptions<T>
	| AliasProviderOptions<T>;
