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
				getContainer() {
					console.log("getContainer", importedModule.container);
					return importedModule.container as IContainer;
				},
			});
		}
	}

	const exportedContainer = createContainer(`${module.name}.exported`);

	for (const it of module.exports ?? []) {
		exportedContainer.register(it, {
			useAlias: it,
			getContainer() {
				return container;
			},
		});
	}

	return exportedContainer;
}
