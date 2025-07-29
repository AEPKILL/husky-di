/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-27 22:55:05
 */

import type { LifecycleEnum } from "@/enums/lifecycle.enum";
import type { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import type { Constructor } from "@/types/constructor.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { IContainer } from "./container.interface";
import type { IUnique } from "./unique.interface";

export type CreateRegistrationBaseOptions = {
	readonly lifecycle?: LifecycleEnum;
};

export type RegistrationResolveOptions = {
	readonly container: IContainer;
	readonly resolveContext: ResolveContext;
};

export type CreateClassRegistrationOptions<T> = {
	readonly useClass: Constructor<T>;
} & CreateRegistrationBaseOptions;

export type CreateFactoryRegistrationOptions<T> = {
	readonly useFactory: (
		container: IContainer,
		resolveContext: ResolveContext,
	) => T;
} & CreateRegistrationBaseOptions;

export type CreateValueRegistrationOptions<T> = {
	readonly useValue: T;
} & CreateRegistrationBaseOptions;

export type CreateAliasRegistrationOptions<T> = {
	readonly useAlias: ServiceIdentifier<T>;
	readonly getContainer?: () => IContainer;
};

export type CreateRegistrationOptions<T> =
	| CreateClassRegistrationOptions<T>
	| CreateFactoryRegistrationOptions<T>
	| CreateValueRegistrationOptions<T>
	| CreateAliasRegistrationOptions<T>;

export interface IRegistration<T> extends IUnique {
	readonly type: RegistrationTypeEnum;
	readonly lifecycle: LifecycleEnum;
	readonly instance: T | undefined;
	readonly resolved: boolean;
	readonly provider:
		| CreateClassRegistrationOptions<T>["useClass"]
		| CreateFactoryRegistrationOptions<T>["useFactory"]
		| CreateValueRegistrationOptions<T>["useValue"]
		| CreateAliasRegistrationOptions<T>["useAlias"];
	readonly container?: IContainer;

	getExtra<T>(key: string | symbol): T | undefined;
	setExtra<T>(key: string | symbol, value: T): void;
	deleteExtra(key: string | symbol): void;
	getExtraKeys(): Array<string | symbol>;
}

export interface IInternalRegistration<T> extends IRegistration<T> {
	setResolved(resolved: boolean): void;
	setInstance(instance: T): void;
}
