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

export function build(module: IInternalModule): IContainer {
	if (module._internalContainer) return module._internalContainer;

	const container = createContainer(module.name);
	if (module.exports?.length) {
		container.use(createExportedGuardMiddlewareFactory(module.exports));
	}

	for (const declaration of module.declarations ?? []) {
		const { serviceIdentifier, ...rest } = declaration;
		container.register(serviceIdentifier, rest);
	}

	for (const it of module.imports ?? []) {
		const importedModule = getModuleByImport(it) as IInternalModule;
		if (!importedModule._internalContainer) {
			importedModule._internalContainer = build(importedModule);
		}

		// 构建别名映射
		const aliasesMap: Map<
			ServiceIdentifier<unknown>,
			ServiceIdentifier<unknown>
		> = new Map();
		for (const alias of (it as ModuleWithAliases)?.aliases || []) {
			aliasesMap.set(alias.serviceIdentifier, alias.as);
		}

		for (const exported of importedModule.exports ?? []) {
			container.register(aliasesMap.get(exported) ?? exported, {
				useAlias: exported,
				getContainer(): IContainer {
					return importedModule._internalContainer as IContainer;
				},
			});
		}
	}

	return container;
}
