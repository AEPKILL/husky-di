/**
 * @overview Module validation utilities.
 * @author AEPKILL
 * @created 2025-03-30
 */

import {
	getServiceIdentifierName,
	type ServiceIdentifier,
} from "@husky-di/core";
import { ModuleErrorCodeEnum } from "@/enums/module-error-code.enum";
import { ModuleException } from "@/exceptions/module.exception";
import type {
	Alias,
	Declaration,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import type { ImportScope } from "@/types/import-scope.type";
import { isModuleWithAliases } from "@/utils/module-import.util";

export function validateDeclarations(
	moduleName: string,
	declarations?: Declaration<unknown>[],
): void {
	if (!declarations || declarations.length === 0) {
		return;
	}

	const seen = new Set<ServiceIdentifier<unknown>>();

	for (const decl of declarations) {
		const { serviceIdentifier } = decl;

		if (seen.has(serviceIdentifier)) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_DUPLICATE_DECLARATION,
				`Duplicate declaration of service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${moduleName}".`,
			);
		}
		seen.add(serviceIdentifier);

		const hasValidOption =
			"useClass" in decl ||
			"useFactory" in decl ||
			"useValue" in decl ||
			"useAlias" in decl;

		if (!hasValidOption) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_INVALID_REGISTRATION,
				`Invalid registration options for service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${moduleName}": must specify useClass, useFactory, useValue, or useAlias.`,
			);
		}
	}
}

export function validateImportUniqueness(
	moduleName: string,
	imports: ReadonlyArray<IModule | ModuleWithAliases>,
): void {
	const seenModules = new Set<string | symbol>();

	for (const item of imports) {
		const importedModule = isModuleWithAliases(item) ? item.module : item;
		const moduleId = importedModule.id;

		if (seenModules.has(moduleId)) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_DUPLICATE_IMPORT_MODULE,
				`Duplicate import module: "${importedModule.displayName}" in "${moduleName}".`,
			);
		}

		seenModules.add(moduleId);
	}
}

export function validateImportAliases(
	imports: ReadonlyArray<IModule | ModuleWithAliases>,
): void {
	for (const item of imports) {
		if (!isModuleWithAliases(item)) {
			continue;
		}

		validateAliases(
			item.module.displayName,
			item.aliases ?? [],
			item.module.exports,
		);
	}
}

export function detectCircularDependencies(
	module: IModule,
	visitedModules = new Set<string | symbol>(),
	visitStack: IModule[] = [],
): void {
	if (visitStack.includes(module)) {
		const cycle = [...visitStack.slice(visitStack.indexOf(module)), module];
		const cyclePath = cycle.map((m) => m.displayName).join(" → ");
		throw new ModuleException(
			ModuleErrorCodeEnum.E_CIRCULAR_DEPENDENCY,
			`Circular dependency detected: ${cyclePath}`,
		);
	}

	if (visitedModules.has(module.id)) {
		return;
	}

	visitStack.push(module);

	const imports = module.imports ?? [];
	for (const item of imports) {
		const importedModule = isModuleWithAliases(item) ? item.module : item;
		detectCircularDependencies(importedModule, visitedModules, visitStack);
	}

	visitedModules.add(module.id);
	visitStack.pop();
}

export function validateAliases(
	moduleName: string,
	aliases: ReadonlyArray<Alias>,
	exports?: ReadonlyArray<ServiceIdentifier<unknown>>,
): void {
	if (!aliases || aliases.length === 0) {
		return;
	}

	const exportedSet = new Set(exports ?? []);
	const mappedServices = new Set<ServiceIdentifier<unknown>>();

	for (const alias of aliases) {
		const { serviceIdentifier } = alias;

		if (!exportedSet.has(serviceIdentifier)) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_ALIAS_SOURCE_NOT_EXPORTED,
				`Cannot alias service identifier "${getServiceIdentifierName(serviceIdentifier)}" from module "${moduleName}": it is not exported from that module.`,
			);
		}

		if (mappedServices.has(serviceIdentifier)) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_DUPLICATE_ALIAS_MAP,
				`Duplicate alias mapping for service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${moduleName}".`,
			);
		}

		mappedServices.add(serviceIdentifier);
	}
}

export function validateImportConflictsWithDeclarations(
	moduleName: string,
	importScope: ImportScope,
	declarations?: Declaration<unknown>[],
): void {
	if (!declarations) {
		return;
	}

	const localDeclarations = new Set(
		(declarations ?? []).map((decl) => decl.serviceIdentifier),
	);

	const conflictingImport = importScope.bindings.find((binding) =>
		localDeclarations.has(binding.localServiceIdentifier),
	);

	if (conflictingImport) {
		throw new ModuleException(
			ModuleErrorCodeEnum.E_IMPORT_CONFLICT_LOCAL,
			`Imported service identifier "${getServiceIdentifierName(conflictingImport.localServiceIdentifier)}" conflicts with local declaration in module "${moduleName}". Use an alias to resolve the conflict.`,
		);
	}
}

export function validateImportNamingConflicts(
	_moduleName: string,
	importScope: ImportScope,
): void {
	if (importScope.bindings.length === 0) {
		return;
	}

	const serviceToModules = importScope.bindings.reduce((acc, binding) => {
		const modules = acc.get(binding.localServiceIdentifier) ?? [];
		modules.push(binding.sourceModule);
		acc.set(binding.localServiceIdentifier, modules);
		return acc;
	}, new Map<ServiceIdentifier<unknown>, IModule[]>());

	const conflicts = Array.from(serviceToModules.entries()).filter(
		([, modules]) => modules.length > 1,
	);

	if (conflicts.length > 0) {
		const [serviceId, modules] = conflicts[0];
		const moduleNames = modules.map((m) => `"${m.displayName}"`).join(", ");
		throw new ModuleException(
			ModuleErrorCodeEnum.E_IMPORT_COLLISION,
			`Service identifier "${getServiceIdentifierName(serviceId)}" is exported by multiple imported modules: ${moduleNames}. Consider using aliases to resolve the conflict.`,
		);
	}
}

export function validateExportUniqueness(
	moduleName: string,
	exports?: ServiceIdentifier<unknown>[],
): void {
	if (!exports || exports.length === 0) {
		return;
	}

	const seen = new Set<ServiceIdentifier<unknown>>();
	for (const exportId of exports) {
		if (seen.has(exportId)) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_DUPLICATE_EXPORT,
				`Duplicate export of service identifier "${getServiceIdentifierName(exportId)}" in module "${moduleName}".`,
			);
		}
		seen.add(exportId);
	}
}

export function collectAvailableServices(
	declarations?: Declaration<unknown>[],
	importScope?: ImportScope,
): Set<ServiceIdentifier<unknown>> {
	const localServices = (declarations ?? []).map(
		(decl) => decl.serviceIdentifier,
	);

	return new Set([
		...localServices,
		...(importScope?.visibleServiceIdentifiers ?? []),
	]);
}

export function validateExportAvailability(
	moduleName: string,
	exports?: ServiceIdentifier<unknown>[],
	declarations?: Declaration<unknown>[],
	importScope?: ImportScope,
): void {
	if (!exports || exports.length === 0) {
		return;
	}

	const availableServices = collectAvailableServices(declarations, importScope);

	for (const exportId of exports) {
		if (!availableServices.has(exportId)) {
			throw new ModuleException(
				ModuleErrorCodeEnum.E_EXPORT_NOT_FOUND,
				`Cannot export service identifier "${getServiceIdentifierName(exportId)}" from "${moduleName}": it is not declared in this module or imported from any imported module.`,
			);
		}
	}
}
