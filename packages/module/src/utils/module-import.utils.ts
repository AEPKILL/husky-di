/**
 * Module import utilities.
 *
 * @overview
 * Provides helpers for working with module import descriptors.
 *
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import type { IModule, ModuleWithAliases } from "@/interfaces/module.interface";

export function isModuleWithAliases(
	item: IModule | ModuleWithAliases,
): item is ModuleWithAliases {
	return "module" in item;
}
