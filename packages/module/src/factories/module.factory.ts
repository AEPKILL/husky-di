/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-10 00:46:22 21:57:05
 */

import { ModuleImpl } from "@/impls/module.impl";

import type {
	CreateModuleOptions,
	IModule,
} from "@/interfaces/module.interface";

export function createModule(options: CreateModuleOptions): IModule {
	return new ModuleImpl(options);
}
