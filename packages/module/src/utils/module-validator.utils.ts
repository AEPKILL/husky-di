/**
 * @overview Module validation utilities.
 * @author AEPKILL
 * @created 2025-03-30
 */

import {
	getServiceIdentifierName,
	type ServiceIdentifier,
} from "@husky-di/core";
import type {
	Alias,
	Declaration,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";

type NormalizedImport = {
	module: IModule;
	serviceIdentifier: ServiceIdentifier<unknown>;
	as: ServiceIdentifier<unknown>;
};

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
			throw new Error(
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
			throw new Error(
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
			throw new Error(
				`Duplicate import module: "${importedModule.displayName}" in "${moduleName}".`,
			);
		}

		seenModules.add(moduleId);
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
		throw new Error(`Circular dependency detected: ${cyclePath}`);
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
	aliases: Alias[],
	exports?: ServiceIdentifier<unknown>[],
): void {
	if (!aliases || aliases.length === 0) {
		return;
	}

	const exportedSet = new Set(exports ?? []);
	const mappedServices = new Set<ServiceIdentifier<unknown>>();

	for (const alias of aliases) {
		const { serviceIdentifier } = alias;

		if (!exportedSet.has(serviceIdentifier)) {
			throw new Error(
				`Cannot alias service identifier "${getServiceIdentifierName(serviceIdentifier)}" from module "${moduleName}": it is not exported from that module.`,
			);
		}

		if (mappedServices.has(serviceIdentifier)) {
			throw new Error(
				`Duplicate alias mapping for service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${moduleName}".`,
			);
		}

		mappedServices.add(serviceIdentifier);
	}
}

export function validateAliasConflictsWithDeclarations(
	moduleName: string,
	imports?: Array<IModule | ModuleWithAliases>,
	declarations?: Declaration<unknown>[],
): void {
	if (!imports || !declarations) {
		return;
	}

	const localDeclarations = new Set(
		(declarations ?? []).map((decl) => decl.serviceIdentifier),
	);

	const conflictingAlias = imports
		.filter((item): item is ModuleWithAliases => isModuleWithAliases(item))
		.flatMap((item) => item.aliases ?? [])
		.find((alias) => localDeclarations.has(alias.as));

	if (conflictingAlias) {
		throw new Error(
			`Alias "${getServiceIdentifierName(conflictingAlias.as)}" conflicts with local declaration in module "${moduleName}".`,
		);
	}
}

export function validateImportNamingConflicts(
	_moduleName: string,
	imports?: Array<IModule | ModuleWithAliases>,
): void {
	if (!imports || imports.length === 0) {
		return;
	}

	const serviceToModules = imports.reduce((acc, item) => {
		const module = isModuleWithAliases(item) ? item.module : item;
		const aliases = isModuleWithAliases(item) ? (item.aliases ?? []) : [];
		const aliasMap = buildAliasMap(aliases);

		for (const serviceId of module.exports ?? []) {
			const effectiveName = aliasMap.get(serviceId) ?? serviceId;
			const modules = acc.get(effectiveName) ?? [];
			modules.push(module);
			acc.set(effectiveName, modules);
		}

		return acc;
	}, new Map<ServiceIdentifier<unknown>, IModule[]>());

	const conflicts = Array.from(serviceToModules.entries()).filter(
		([, modules]) => modules.length > 1,
	);

	if (conflicts.length > 0) {
		const [serviceId, modules] = conflicts[0];
		const moduleNames = modules.map((m) => `"${m.displayName}"`).join(", ");
		throw new Error(
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
			throw new Error(
				`Duplicate export of service identifier "${getServiceIdentifierName(exportId)}" in module "${moduleName}".`,
			);
		}
		seen.add(exportId);
	}
}

export function collectAvailableServices(
	declarations?: Declaration<unknown>[],
	imports?: Array<IModule | ModuleWithAliases>,
): Set<ServiceIdentifier<unknown>> {
	const localServices = (declarations ?? []).map(
		(decl) => decl.serviceIdentifier,
	);

	const importedServices = (imports ?? []).flatMap((item) => {
		const module = isModuleWithAliases(item) ? item.module : item;
		const aliases = isModuleWithAliases(item) ? (item.aliases ?? []) : [];
		const aliasMap = buildAliasMap(aliases);

		return (module.exports ?? []).map(
			(serviceId) => aliasMap.get(serviceId) ?? serviceId,
		);
	});

	return new Set([...localServices, ...importedServices]);
}

export function validateExportAvailability(
	moduleName: string,
	exports?: ServiceIdentifier<unknown>[],
	declarations?: Declaration<unknown>[],
	imports?: Array<IModule | ModuleWithAliases>,
): void {
	if (!exports || exports.length === 0) {
		return;
	}

	const availableServices = collectAvailableServices(declarations, imports);

	for (const exportId of exports) {
		if (!availableServices.has(exportId)) {
			throw new Error(
				`Cannot export service identifier "${getServiceIdentifierName(exportId)}" from "${moduleName}": it is not declared in this module or imported from any imported module.`,
			);
		}
	}
}

export function normalizeImports(
	imports: ReadonlyArray<IModule | ModuleWithAliases>,
): NormalizedImport[] {
	return imports.flatMap((item) => {
		const module = isModuleWithAliases(item) ? item.module : item;
		const aliases = isModuleWithAliases(item) ? (item.aliases ?? []) : [];
		const aliasMap = buildAliasMap(aliases);

		return (module.exports ?? []).map((serviceIdentifier) => ({
			module,
			serviceIdentifier,
			as: aliasMap.get(serviceIdentifier) ?? serviceIdentifier,
		}));
	});
}

function buildAliasMap(
	aliases: Alias[] | undefined,
): Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>> {
	return new Map(
		(aliases ?? []).map((alias) => [alias.serviceIdentifier, alias.as]),
	);
}

function isModuleWithAliases(
	item: IModule | ModuleWithAliases,
): item is ModuleWithAliases {
	return "module" in item;
}
