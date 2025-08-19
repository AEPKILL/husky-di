/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-12 19:57:50
 */

import {
	createContainer,
	type IContainer,
	type ServiceIdentifier,
} from "@husky-di/core";
import { createExportedGuardMiddlewareFactory } from "@/factories/exported-guard-middleware.factory";
import { Module } from "@/impls/module";
import type {
	CreateModuleOptions,
	IInternalModule,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";

export function getModuleByImport(
	moduleImport: NonNullable<CreateModuleOptions["imports"]>[number],
): IModule {
	if ((moduleImport as ModuleWithAliases).module instanceof Module) {
		return (moduleImport as ModuleWithAliases).module;
	}

	if (moduleImport instanceof Module) {
		return moduleImport;
	}

	throw new Error("Invalid module import");
}

export function build(module: IModule): IContainer {
	if (module.container) return module.container;

	const container = createContainer(module.name);
	if (module.exports?.length) {
		container.use(createExportedGuardMiddlewareFactory(module.exports));
	}

	for (const declaration of module.declarations ?? []) {
		const { serviceIdentifier, ...rest } = declaration;
		container.register(serviceIdentifier, rest);
	}

	for (const it of module.imports ?? []) {
		const importedModule = getModuleByImport(it);
		if (!importedModule.container) {
			const importedContainer = build(importedModule);
			(importedModule as IInternalModule)._internalSetContainer(
				importedContainer,
			);
		}
		const aliasesMap: Map<
			ServiceIdentifier<unknown>,
			ServiceIdentifier<unknown>
		> = ((it as ModuleWithAliases)?.aliases || []).reduce((acc, alias) => {
			acc.set(alias.serviceIdentifier, alias.as);
			return acc;
		}, new Map());

		for (const exported of importedModule.exports ?? []) {
			container.register(aliasesMap.get(exported) ?? exported, {
				useAlias: exported,
				getContainer(): IContainer {
					return importedModule.container as IContainer;
				},
			});
		}
	}

	return container;
}
