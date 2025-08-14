/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 14:42:25
 */
import type {
	CreateRegistrationOptions,
	IContainer,
	IDisplayName,
	IUnique,
	ServiceIdentifier,
} from "@husky-di/core";

export type Declaration<T> = CreateRegistrationOptions<T> & {
	serviceIdentifier: ServiceIdentifier<T> | string;
};

export type Alias = {
	serviceIdentifier: ServiceIdentifier<unknown>;
	as: ServiceIdentifier<unknown>;
};

export type CreateModuleOptions = {
	readonly name: string;

	readonly declarations?: Declaration<unknown>[];
	readonly imports?: Array<IModule | ModuleWithAliases>;
	readonly exports?: ServiceIdentifier<unknown>[];
};

export type ModuleWithAliases = {
	module: IModule;
	aliases?: Alias[];
};

export interface IModule extends IUnique, IDisplayName {
	readonly name: string;
	readonly declarations?: Declaration<unknown>[];
	readonly imports?: Array<IModule | ModuleWithAliases>;
	readonly exports?: ServiceIdentifier<unknown>[];
	readonly container?: IContainer;

	withAliases(aliases: Alias[]): ModuleWithAliases;
}

export interface IInternalModule extends IModule {
	_internalSetContainer(container: IContainer): void;
}
