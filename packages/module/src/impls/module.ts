/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 14:51:09
 */

import type {
	IContainer,
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddleware,
	ResolveOptions,
	ServiceIdentifier,
} from "@husky-di/core";
import type {
	Alias,
	CreateModuleOptions,
	Declaration,
	IInternalModule,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import { build } from "@/utils/module.utils";
import { createModuleId } from "@/utils/uuid.utils";

export class Module implements IInternalModule {
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

	readonly _internalContainer: IContainer;

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
		this._internalContainer = build(this);
	}
	public resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: O,
	): ResolveInstance<T, O> {
		return this._internalContainer.resolve(
			serviceIdentifier,
			options as O,
		) as ResolveInstance<T, O>;
	}

	isRegistered<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: IsRegisteredOptions,
	): boolean {
		return this._internalContainer.isRegistered(serviceIdentifier, options);
	}
	getServiceIdentifiers(): ServiceIdentifier<unknown>[] {
		return this._internalContainer.getServiceIdentifiers();
	}
	// biome-ignore lint/suspicious/noExplicitAny: should use any type
	use(middleware: ResolveMiddleware<any, any>): void {
		this._internalContainer.use(middleware);
	}
	// biome-ignore lint/suspicious/noExplicitAny: should use any type
	unused(middleware: ResolveMiddleware<any, any>): void {
		this._internalContainer.unused(middleware);
	}

	withAliases(aliases: Alias[]): ModuleWithAliases {
		return {
			module: this,
			aliases,
		};
	}
}
