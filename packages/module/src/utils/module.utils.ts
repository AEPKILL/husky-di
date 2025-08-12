/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-12 19:57:50
 */

import { Module } from "@/impls/module";
import type {
	CreateModuleOptions,
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
