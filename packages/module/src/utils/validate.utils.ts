/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-12 19:22:37
 */

import {
	getServiceIdentifierName,
	type ServiceIdentifier,
} from "@husky-di/core";
import type { IModule } from "@/interfaces/module.interface";
import { getModuleByImport } from "./module.utils";

export function validateModule(module: IModule) {
	const { imports, declarations, exports } = module;

	// 检查 imports 中是否有重复的 module
	const importModules = new Set<IModule>();
	for (const importModule of imports ?? []) {
		const importedModule = getModuleByImport(importModule);
		if (importModules.has(importedModule)) {
			throw new Error(
				`Duplicate import module: "${importedModule.displayName}"`,
			);
		}
		importModules.add(importedModule);
	}

	// 检查 exports 中是否存在重复的 Service Identifier
	const existingExportServiceIdentifiers = new Set<
		ServiceIdentifier<unknown>
	>();
	for (const exported of exports ?? []) {
		if (existingExportServiceIdentifiers.has(exported)) {
			throw new Error(
				`Duplicate export service identifier: "${getServiceIdentifierName(exported)}" in "${module.displayName}"`,
			);
		}
		existingExportServiceIdentifiers.add(exported);
	}

	// 检查  imports 和 declarations 中是否存在冲突的 Service Identifier
	const existingServiceIdentifiers = new Map<
		ServiceIdentifier<unknown>,
		string
	>();
	for (const declaration of declarations ?? []) {
		existingServiceIdentifiers.set(
			declaration.serviceIdentifier,
			"declarations",
		);
	}
	for (const importModule of importModules) {
		for (const exported of importModule.exports ?? []) {
			if (existingServiceIdentifiers.has(exported)) {
				throw new Error(
					`Service identifier conflict: "${getServiceIdentifierName(exported)}" is exported by "${importModule.displayName}" and declared in "${existingServiceIdentifiers.get(exported)}"`,
				);
			}
			existingServiceIdentifiers.set(exported, importModule.displayName);
		}
	}
}
