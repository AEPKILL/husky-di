/**
 * @overview Module implementation.
 * @author AEPKILL
 * @created 2025-08-09 14:51:09
 */

import {
	type Cleanup,
	createContainer,
	type IContainer,
	type IsRegisteredOptions,
	type ResolveInstance,
	type ResolveMiddleware,
	type ResolveOptions,
	type ServiceIdentifier,
} from "@husky-di/core";
import { createExportedGuardMiddleware } from "@/factories/exported-guard-middleware.factory";
import { createImportScope } from "@/factories/import-scope.factory";
import type {
	Alias,
	CreateModuleOptions,
	Declaration,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import type { ImportScope } from "@/types/import-scope.type";
import {
	detectCircularDependencies,
	validateAliases,
	validateDeclarations,
	validateExportAvailability,
	validateExportUniqueness,
	validateImportAliases,
	validateImportConflictsWithDeclarations,
	validateImportNamingConflicts,
	validateImportUniqueness,
} from "@/utils/module-validator.utils";
import { createModuleId } from "@/utils/uuid.utils";

export class ModuleImpl implements IModule {
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
		return `${String(this._name)}/${this._id}`;
	}

	readonly container: IContainer;

	private readonly _id: string;
	private readonly _name: string;
	private readonly _declarations?: Declaration<unknown>[];
	private readonly _imports?: Array<IModule | ModuleWithAliases>;
	private readonly _exports?: ServiceIdentifier<unknown>[];
	private readonly _importScope: ImportScope;

	constructor(options: CreateModuleOptions) {
		this._id = createModuleId();
		this._name = options.name;
		this._declarations = options.declarations;
		this._imports = options.imports;
		this._exports = options.exports;
		this._importScope = createImportScope(this._imports);

		this.validateConfiguration();

		this.container = this.buildContainer();
		this.container.use(createExportedGuardMiddleware(this.exports ?? []));
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
	use(...middleware: ResolveMiddleware<any, any>[]): Cleanup {
		return this.container.use(...middleware);
	}

	// biome-ignore lint/suspicious/noExplicitAny: should use any type
	unused(...middleware: ResolveMiddleware<any, any>[]): void {
		this.container.unused(...middleware);
	}

	withAliases(aliases: Alias[]): ModuleWithAliases {
		validateAliases(this.displayName, aliases, this._exports);
		return {
			module: this,
			aliases,
		};
	}

	private buildContainer(): IContainer {
		const container = createContainer(this._name);
		this.registerDeclarations(container);
		this.registerImports(container);
		return container;
	}

	private validateConfiguration(): void {
		validateDeclarations(this.displayName, this._declarations);
		this.validateImports();
		this.validateExports();
	}

	private validateImports(): void {
		if (!this._imports || this._imports.length === 0) {
			return;
		}

		validateImportUniqueness(this.displayName, this._imports);
		validateImportAliases(this._imports);
		detectCircularDependencies(this);
		validateImportConflictsWithDeclarations(
			this.displayName,
			this._importScope,
			this._declarations,
		);
		validateImportNamingConflicts(this.displayName, this._importScope);
	}

	private registerDeclarations(container: IContainer): void {
		if (!this._declarations || this._declarations.length === 0) {
			return;
		}

		for (const decl of this._declarations) {
			const { serviceIdentifier, ...options } = decl;
			container.register(serviceIdentifier, options);
		}
	}

	private registerImports(container: IContainer): void {
		if (this._importScope.bindings.length === 0) {
			return;
		}

		for (const binding of this._importScope.bindings) {
			container.register(binding.localServiceIdentifier, {
				useAlias: binding.sourceServiceIdentifier,
				getContainer: () => binding.sourceModule.container,
			});
		}
	}

	private validateExports(): void {
		if (!this._exports || this._exports.length === 0) {
			return;
		}

		validateExportUniqueness(this.displayName, this._exports);
		validateExportAvailability(
			this.displayName,
			this._exports,
			this._declarations,
			this._importScope,
		);
	}
}
