/**
 * Module import utilities.
 *
 * @overview
 * Provides helpers for working with module import descriptors.
 *
 * @author AEPKILL
 * @created 2026-05-09 01:00:49
 */

import type { IModule, ModuleWithAliases } from "@/interfaces/module.interface";

export function isModuleWithAliases(
	item: IModule | ModuleWithAliases,
): item is ModuleWithAliases {
	return "module" in item;
}
