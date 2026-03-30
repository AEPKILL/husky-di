/**
 * @overview Module implementation.
 * @author AEPKILL
 * @created 2025-08-09 14:51:09
 */

import {
	createContainer,
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
import {
	detectCircularDependencies as detectCircularDependenciesUtil,
	normalizeImports as normalizeImportsUtil,
	validateAliasConflictsWithDeclarations as validateAliasConflictsWithDeclarationsUtil,
	validateAliases as validateAliasesUtil,
	validateDeclarations as validateDeclarationsUtil,
	validateExportAvailability as validateExportAvailabilityUtil,
	validateExportUniqueness as validateExportUniquenessUtil,
	validateImportNamingConflicts as validateImportNamingConflictsUtil,
	validateImportUniqueness as validateImportUniquenessUtil,
} from "@/utils/module-validator.utils";
import { createModuleId } from "@/utils/uuid.utils";

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

	constructor(options: CreateModuleOptions) {
		this._id = createModuleId();
		this._name = options.name;
		this._declarations = options.declarations;
		this._imports = options.imports;
		this._exports = options.exports;

		// Validate configuration (order is important!)
		this.validateDeclarations();
		this.validateImports();
		this.validateExports();

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
		validateAliasesUtil(this.displayName, aliases, this._exports);
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

	private validateImports(): void {
		if (!this._imports || this._imports.length === 0) {
			return;
		}

		validateImportUniquenessUtil(this.displayName, this._imports);
		detectCircularDependenciesUtil(this);
		validateAliasConflictsWithDeclarationsUtil(
			this.displayName,
			this._imports,
			this._declarations,
		);
		validateImportNamingConflictsUtil(this.displayName, this._imports);
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
		if (!this._imports || this._imports.length === 0) {
			return;
		}

		const normalizedImports = normalizeImportsUtil(this._imports);

		for (const {
			module: sourceModule,
			serviceIdentifier,
			as,
		} of normalizedImports) {
			if (serviceIdentifier !== as) {
				container.register(as, {
					useAlias: serviceIdentifier,
					getContainer: () => sourceModule.container,
				});
			} else {
				container.register(serviceIdentifier, {
					useAlias: serviceIdentifier,
					getContainer: () => sourceModule.container,
				});
			}
		}
	}

	private validateDeclarations(): void {
		validateDeclarationsUtil(this.displayName, this._declarations);
	}

	private validateExports(): void {
		if (!this._exports || this._exports.length === 0) {
			return;
		}

		validateExportUniquenessUtil(this.displayName, this._exports);
		validateExportAvailabilityUtil(
			this.displayName,
			this._exports,
			this._declarations,
			this._imports,
		);
	}
}
