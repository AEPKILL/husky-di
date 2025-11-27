/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 14:51:09
 */

import {
	createContainer,
	getServiceIdentifierName,
	type IContainer,
	type IsRegisteredOptions,
	type ResolveInstance,
	type ResolveMiddleware,
	type ResolveOptions,
	type ServiceIdentifier,
} from "@husky-di/core";
import { createExportedGuardMiddlewareFactory } from "@/factories/exported-guard-middleware.factory";
import type {
	Alias,
	CreateModuleOptions,
	Declaration,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import { createModuleId } from "@/utils/uuid.utils";

/**
 * Normalized import with alias mapping.
 */
type NormalizedImport = {
	module: IModule;
	serviceIdentifier: ServiceIdentifier<unknown>;
	as: ServiceIdentifier<unknown>;
};

export class Module implements IModule {
	get id() {
		return this._id;
	}

	get name() {
		return this._name;
	}

	get declarations() {
		return this._declarations;
	}

	get exports() {
		return this._exports;
	}

	get imports() {
		return this._imports;
	}

	get displayName(): string {
		return `${String(this._name)}#${this._id}`;
	}

	readonly container: IContainer;

	private _id: string;
	private _name: string;
	private _declarations?: Declaration<unknown>[];
	private _imports?: Array<IModule | ModuleWithAliases>;
	private _exports?: ServiceIdentifier<unknown>[];
	private readonly _visitedModules = new Set<string | symbol>();
	private readonly _visitStack: IModule[] = [];

	constructor(options: CreateModuleOptions) {
		this._id = createModuleId();
		this._name = options.name;
		this._declarations = options.declarations;
		this._imports = options.imports;
		this._exports = options.exports;

		// Validate configuration (order is important!)
		this.validateDeclarations(); // 1. First validate declarations
		this.validateImports(); // 2. Then validate imports (needs to access imported modules)
		this.validateExports(); // 3. Finally validate exports (needs declarations and imports info)

		// Build container
		this.container = this.buildContainer();
		this.container.use(
			createExportedGuardMiddlewareFactory(this.exports ?? []),
		);
	}

	public resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: O,
	): ResolveInstance<T, O> {
		return this.container.resolve(
			serviceIdentifier,
			options as O,
		) as ResolveInstance<T, O>;
	}

	isRegistered<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: IsRegisteredOptions,
	): boolean {
		return this.container.isRegistered(serviceIdentifier, options);
	}

	getServiceIdentifiers(): ServiceIdentifier<unknown>[] {
		return this.container.getServiceIdentifiers();
	}

	// biome-ignore lint/suspicious/noExplicitAny: should use any type
	use(middleware: ResolveMiddleware<any, any>): void {
		this.container.use(middleware);
	}

	// biome-ignore lint/suspicious/noExplicitAny: should use any type
	unused(middleware: ResolveMiddleware<any, any>): void {
		this.container.unused(middleware);
	}

	withAliases(aliases: Alias[]): ModuleWithAliases {
		this.validateAliases(aliases);
		return {
			module: this,
			aliases,
		};
	}

	/**
	 * Builds the container for this module.
	 *
	 * @returns The built container
	 *
	 * @remarks
	 * This method is called after all validations have been performed.
	 * It creates the container and registers all declarations and imports.
	 */
	private buildContainer(): IContainer {
		// Create the container with the module's name
		const container = createContainer(this._name);

		// 1. Register local declarations
		this.registerDeclarations(container);

		// 2. Register imports (with alias support)
		this.registerImports(container);

		return container;
	}

	/**
	 * Validates the module's imports.
	 *
	 * @throws Error if validation fails
	 *
	 * @remarks
	 * Validates the following rules:
	 * - Rule I1: Module uniqueness - no module imported multiple times
	 * - Rule I2: Circular dependencies - no circular import chains
	 * - Rule I3: Alias validation - aliases reference exported services and don't conflict
	 * - Rule I4: Import naming conflicts - no service name conflicts across imports
	 */
	private validateImports(): void {
		if (!this._imports || this._imports.length === 0) {
			return;
		}

		// Rule I1: Check for duplicate module imports
		this.validateImportUniqueness(this._imports);

		// Rule I2: Check for circular dependencies
		this.detectCircularDependencies();

		// Rule I3: Validate aliases don't conflict with local declarations
		this.validateAliasConflictsWithDeclarations();

		// Rule I4: Check for naming conflicts across imports
		this.validateImportNamingConflicts();
	}

	/**
	 * Validates that no module is imported multiple times (Rule I1).
	 *
	 * @param imports - Array of imports to validate
	 * @throws Error if a module is imported more than once
	 *
	 * @remarks
	 * This prevents accidentally importing the same module multiple times,
	 * which would be redundant and potentially confusing.
	 */
	private validateImportUniqueness(
		imports: ReadonlyArray<IModule | ModuleWithAliases>,
	): void {
		const seenModules = new Set<string | symbol>();

		for (const item of imports) {
			const importedModule = this.isModuleWithAliases(item)
				? item.module
				: item;
			const moduleId = importedModule.id;

			if (seenModules.has(moduleId)) {
				throw new Error(
					`Duplicate import module: "${importedModule.displayName}" in "${this.displayName}".`,
				);
			}

			seenModules.add(moduleId);
		}
	}

	/**
	 * Detects circular dependencies in the module import graph.
	 *
	 * @throws Error if a circular dependency is detected
	 */
	private detectCircularDependencies(): void {
		this._visitedModules.clear();
		this._visitStack.length = 0;
		this.visitModule(this);
	}

	/**
	 * Recursively visits a module to detect circular dependencies (Rule I2).
	 *
	 * @param module - The module to visit
	 * @throws Error if a circular dependency is detected
	 *
	 * @remarks
	 * Uses depth-first search with a visit stack to detect cycles.
	 * The visit stack tracks the current path being explored, while
	 * visitedModules tracks fully processed modules to avoid redundant work.
	 */
	private visitModule(module: IModule): void {
		// Check if this module is already in the current visit stack (circular dependency)
		if (this._visitStack.includes(module)) {
			const cycle = [
				...this._visitStack.slice(this._visitStack.indexOf(module)),
				module,
			];
			const cyclePath = cycle.map((m) => m.displayName).join(" → ");
			throw new Error(`Circular dependency detected: ${cyclePath}`);
		}

		// If already fully visited, skip
		if (this._visitedModules.has(module.id)) {
			return;
		}

		// Add to visit stack
		this._visitStack.push(module);

		// Visit all imports
		const imports = module.imports ?? [];
		for (const item of imports) {
			const importedModule = this.isModuleWithAliases(item)
				? item.module
				: item;
			this.visitModule(importedModule);
		}

		// Mark as visited and remove from stack
		this._visitedModules.add(module.id);
		this._visitStack.pop();
	}

	/**
	 * Registers the module's local declarations in the container.
	 *
	 * @param container - The container to register declarations in
	 */
	private registerDeclarations(container: IContainer): void {
		if (!this._declarations || this._declarations.length === 0) {
			return;
		}

		for (const decl of this._declarations) {
			const { serviceIdentifier, ...options } = decl;
			container.register(serviceIdentifier, options);
		}
	}

	/**
	 * Registers the module's imports in the container.
	 *
	 * @param container - The container to register imports in
	 */
	private registerImports(container: IContainer): void {
		if (!this._imports || this._imports.length === 0) {
			return;
		}

		const normalizedImports = this.normalizeImports(this._imports);

		// Register aliases
		for (const {
			module: sourceModule,
			serviceIdentifier,
			as,
		} of normalizedImports) {
			// If there's an alias, register it
			if (serviceIdentifier !== as) {
				container.register(as, {
					useAlias: serviceIdentifier,
					getContainer: () => sourceModule.container,
				});
			} else {
				// No alias, register direct access to the source container
				container.register(serviceIdentifier, {
					useAlias: serviceIdentifier,
					getContainer: () => sourceModule.container,
				});
			}
		}
	}

	/**
	 * Normalizes imports into a flat list of service identifiers with their aliases.
	 *
	 * @param imports - Array of imports to normalize
	 * @returns Normalized array of imports with alias mappings
	 *
	 * @remarks
	 * This method transforms the import declarations into a format suitable
	 * for container registration, applying any alias mappings in the process.
	 */
	private normalizeImports(
		imports: ReadonlyArray<IModule | ModuleWithAliases>,
	): NormalizedImport[] {
		return imports.flatMap((item) => {
			const module = this.isModuleWithAliases(item) ? item.module : item;
			const aliases = this.isModuleWithAliases(item) ? item.aliases : undefined;
			const aliasMap = this.buildAliasMap(aliases);

			return (module.exports ?? []).map((serviceIdentifier) => ({
				module,
				serviceIdentifier,
				as: aliasMap.get(serviceIdentifier) ?? serviceIdentifier,
			}));
		});
	}

	/**
	 * Builds a map of service identifier aliases from an alias array.
	 *
	 * @param aliases - Array of alias mappings
	 * @returns Map from source service identifier to target service identifier
	 *
	 * @remarks
	 * This method is used throughout the validation and registration process
	 * to consistently apply alias transformations.
	 */
	private buildAliasMap(
		aliases: Alias[] | undefined,
	): Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>> {
		return new Map(
			(aliases ?? []).map((alias) => [alias.serviceIdentifier, alias.as]),
		);
	}

	/**
	 * Validates declarations for this module.
	 *
	 * @throws Error if validation fails
	 *
	 * @remarks
	 * Validates that:
	 * 1. No serviceIdentifier is declared multiple times (Rule D1)
	 * 2. Each declaration has valid registration options (Rule D2)
	 */
	private validateDeclarations(): void {
		if (!this._declarations || this._declarations.length === 0) {
			return;
		}

		const seen = new Set<ServiceIdentifier<unknown>>();

		for (const decl of this._declarations) {
			const { serviceIdentifier } = decl;

			// Rule D1: Check for duplicate declarations
			if (seen.has(serviceIdentifier)) {
				throw new Error(
					`Duplicate declaration of service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${this.displayName}".`,
				);
			}
			seen.add(serviceIdentifier);

			// Rule D2: Check for valid registration options
			// The registration must have at least one of: useClass, useFactory, useValue, useAlias
			const hasValidOption =
				"useClass" in decl ||
				"useFactory" in decl ||
				"useValue" in decl ||
				"useAlias" in decl;

			if (!hasValidOption) {
				throw new Error(
					`Invalid registration options for service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${this.displayName}": must specify useClass, useFactory, useValue, or useAlias.`,
				);
			}
		}
	}

	/**
	 * Validates exports for this module.
	 *
	 * @throws Error if validation fails
	 *
	 * @remarks
	 * Validates that:
	 * 1. No serviceIdentifier is exported multiple times
	 * 2. Each exported serviceIdentifier is either declared locally or imported
	 * 3. Aliased imports must be exported using their alias name, not original name
	 */
	private validateExports(): void {
		if (!this._exports || this._exports.length === 0) {
			return;
		}

		// Rule E2: Check for duplicate exports
		const seen = new Set<ServiceIdentifier<unknown>>();
		for (const exportId of this._exports) {
			if (seen.has(exportId)) {
				throw new Error(
					`Duplicate export of service identifier "${getServiceIdentifierName(exportId)}" in module "${this.displayName}".`,
				);
			}
			seen.add(exportId);
		}

		// Rule E1: Check that each export is available (declared or imported)
		const availableServices = this.collectAvailableServices();

		for (const exportId of this._exports) {
			if (!availableServices.has(exportId)) {
				throw new Error(
					`Cannot export service identifier "${getServiceIdentifierName(exportId)}" from "${this.displayName}": it is not declared in this module or imported from any imported module.`,
				);
			}
		}
	}

	/**
	 * Collects all service identifiers that are available in this module.
	 *
	 * @returns Set of available service identifiers
	 *
	 * @remarks
	 * Available services include:
	 * 1. Locally declared services
	 * 2. Imported services (considering aliases)
	 *
	 * This is used by validateExports to ensure only available services are exported.
	 */
	private collectAvailableServices(): Set<ServiceIdentifier<unknown>> {
		// Collect local declarations
		const localServices = (this._declarations ?? []).map(
			(decl) => decl.serviceIdentifier,
		);

		// Collect imported services with effective names (considering aliases)
		const importedServices = (this._imports ?? []).flatMap((item) => {
			const module = this.isModuleWithAliases(item) ? item.module : item;
			const aliases = this.isModuleWithAliases(item) ? item.aliases : undefined;
			const aliasMap = this.buildAliasMap(aliases);

			return (module.exports ?? []).map(
				(serviceId) => aliasMap.get(serviceId) ?? serviceId,
			);
		});

		return new Set([...localServices, ...importedServices]);
	}

	/**
	 * Validates aliases for this module (called from withAliases).
	 *
	 * @param aliases - Array of alias mappings to validate
	 * @throws Error if validation fails
	 *
	 * @remarks
	 * Validates that:
	 * 1. Each aliased serviceIdentifier is exported by this module (Rule I3.1)
	 * 2. No serviceIdentifier is mapped multiple times (Rule I3.2)
	 *
	 * Note: Rule I3.3 (alias conflicts with declarations) is validated during
	 * module construction in validateAliasConflictsWithDeclarations()
	 */
	private validateAliases(aliases: Alias[]): void {
		if (!aliases || aliases.length === 0) {
			return;
		}

		const exportedSet = new Set(this._exports ?? []);
		const mappedServices = new Set<ServiceIdentifier<unknown>>();

		for (const alias of aliases) {
			const { serviceIdentifier } = alias;

			// Rule I3.1: serviceIdentifier must be exported by this module
			if (!exportedSet.has(serviceIdentifier)) {
				throw new Error(
					`Cannot alias service identifier "${getServiceIdentifierName(serviceIdentifier)}" from module "${this.displayName}": it is not exported from that module.`,
				);
			}

			// Rule I3.2: No duplicate alias mappings for the same serviceIdentifier
			if (mappedServices.has(serviceIdentifier)) {
				throw new Error(
					`Duplicate alias mapping for service identifier "${getServiceIdentifierName(serviceIdentifier)}" in module "${this.displayName}".`,
				);
			}

			mappedServices.add(serviceIdentifier);
		}
	}

	/**
	 * Validates that aliases don't conflict with local declarations (Rule I3.3).
	 *
	 * @throws Error if an alias name conflicts with a local declaration
	 *
	 * @remarks
	 * This ensures that aliased imports don't shadow or conflict with
	 * services declared in the current module.
	 */
	private validateAliasConflictsWithDeclarations(): void {
		if (!this._imports || !this._declarations) {
			return;
		}

		// Collect all locally declared service identifiers
		const localDeclarations = new Set(
			(this._declarations ?? []).map((decl) => decl.serviceIdentifier),
		);

		// Check each import for alias conflicts
		const conflictingAlias = (this._imports ?? [])
			.filter((item): item is ModuleWithAliases =>
				this.isModuleWithAliases(item),
			)
			.flatMap((item) => item.aliases ?? [])
			.find((alias) => localDeclarations.has(alias.as));

		if (conflictingAlias) {
			throw new Error(
				`Alias "${getServiceIdentifierName(conflictingAlias.as)}" conflicts with local declaration in module "${this.displayName}".`,
			);
		}
	}

	/**
	 * Validates that imported services don't have naming conflicts (Rule I4).
	 *
	 * @throws Error if the same service identifier is exported by multiple modules
	 *
	 * @remarks
	 * This prevents ambiguity when multiple imported modules export services
	 * with the same name. Users should use aliases to resolve such conflicts.
	 */
	private validateImportNamingConflicts(): void {
		if (!this._imports || this._imports.length === 0) {
			return;
		}

		// Map service identifiers to the modules that export them
		const serviceToModules = (this._imports ?? []).reduce((acc, item) => {
			const module = this.isModuleWithAliases(item) ? item.module : item;
			const aliases = this.isModuleWithAliases(item) ? item.aliases : undefined;
			const aliasMap = this.buildAliasMap(aliases);

			for (const serviceId of module.exports ?? []) {
				const effectiveName = aliasMap.get(serviceId) ?? serviceId;
				const modules = acc.get(effectiveName) ?? [];
				modules.push(module);
				acc.set(effectiveName, modules);
			}

			return acc;
		}, new Map<ServiceIdentifier<unknown>, IModule[]>());

		// Check for conflicts (same service name from multiple modules)
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

	/**
	 * Helper method to check if an import item is a ModuleWithAliases.
	 *
	 * @param item - The import item to check
	 * @returns True if the item is a ModuleWithAliases, false otherwise
	 */
	private isModuleWithAliases(
		item: IModule | ModuleWithAliases,
	): item is ModuleWithAliases {
		return "module" in item;
	}
}
