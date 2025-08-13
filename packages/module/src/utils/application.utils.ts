/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-12 21:39:50
 */

import {
	createContainer,
	type IContainer,
	type ServiceIdentifier,
} from "@husky-di/core";
import type {
	IInternalModule,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import { getModuleByImport } from "./module.utils";

export function createApplication(module: IModule): IContainer {
	if (module.container) return module.container;

	const container = createContainer(module.name);
	for (const declaration of module.declarations ?? []) {
		const { serviceIdentifier, ...rest } = declaration;
		container.register(serviceIdentifier, rest);
	}

	for (const it of module.imports ?? []) {
		const importedModule = getModuleByImport(it);
		if (!importedModule.container) {
			const importedContainer = createApplication(importedModule);
			(importedModule as IInternalModule).setContainer(importedContainer);
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

	return container;
}
