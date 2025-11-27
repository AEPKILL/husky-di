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
	readonly serviceIdentifier: ServiceIdentifier<T>;
};

export type Alias = {
	readonly serviceIdentifier: ServiceIdentifier<unknown>;
	readonly as: ServiceIdentifier<unknown>;
};

export type CreateModuleOptions = {
	readonly name: string;
	readonly declarations?: Declaration<unknown>[];
	readonly imports?: Array<IModule | ModuleWithAliases>;
	readonly exports?: ServiceIdentifier<unknown>[];
};

export type ModuleWithAliases = {
	readonly module: IModule;
	readonly aliases?: Alias[];
};

export interface IModule
	extends IUnique,
		IDisplayName,
		Pick<
			IContainer,
			"resolve" | "isRegistered" | "getServiceIdentifiers" | "use" | "unused"
		> {
	readonly name: string;
	readonly declarations?: ReadonlyArray<Declaration<unknown>>;
	readonly imports?: ReadonlyArray<IModule | ModuleWithAliases>;
	readonly exports?: ReadonlyArray<ServiceIdentifier<unknown>>;
	readonly container: IContainer;
	withAliases(aliases: Alias[]): ModuleWithAliases;
}
