/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 21:57:05
 */

import { ModuleImpl } from "@/impls/ModuleImpl";

import type {
	CreateModuleOptions,
	IModule,
} from "@/interfaces/module.interface";

export function createModule(options: CreateModuleOptions): IModule {
	return new ModuleImpl(options);
}
