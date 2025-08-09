/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 14:51:09
 */

import {
	getServiceIdentifierName,
	type ServiceIdentifier,
} from "@husky-di/core";
import type {
	Alias,
	CreateModuleOptions,
	Declaration,
	IModule,
} from "@/interfaces/module.interface";
import { createModuleAliasId, createModuleId } from "@/utils/uuid.utils";

let withAliasId: string | undefined;
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

	private _id: string;
	private _name: string;
	private _declarations?: Declaration<unknown>[];
	private _imports?: IModule[];
	private _exports?: ServiceIdentifier<unknown>[];

	constructor(options: CreateModuleOptions) {
		this._id = withAliasId ?? createModuleId();
		this._name = options.name;
		this._declarations = options.declarations;
		this._imports = options.imports;
		this._exports = options.exports;

		this._validateImports();
		this._validateExports();
	}

	withAlias(aliases: Alias[]): IModule {
		const availableExportServiceIdentifiers: Set<ServiceIdentifier<unknown>> =
			this._getAvailableExportServiceIdentifiers();

		for (const alias of aliases) {
			if (!availableExportServiceIdentifiers.has(alias.serviceIdentifier)) {
				throw new Error(
					`Can't find service identifier "${getServiceIdentifierName(alias.serviceIdentifier)}" in "${this.displayName}".`,
				);
			}
		}

		withAliasId = createModuleAliasId();
		try {
			return new Module({
				name: this._name,
				imports: [this],
			});
		} finally {
			withAliasId = undefined;
		}
	}

	private _validateImports(): void {
		if (!this._imports?.length) return;
		const serviceIdentifierSet: Set<ServiceIdentifier<unknown>> = new Set();
		for (const declaration of this._declarations ?? []) {
			serviceIdentifierSet.add(declaration.serviceIdentifier);
		}
		for (const module of this._imports) {
			for (const exportServiceIdentifier of module.exports ?? []) {
				if (!serviceIdentifierSet.has(exportServiceIdentifier)) {
					serviceIdentifierSet.add(exportServiceIdentifier);
				}
				throw new Error(
					`Shouldn't redeclare "${getServiceIdentifierName(exportServiceIdentifier)}" from "${module.displayName}", please use "withAlias" to resolve the conflict.`,
				);
			}
		}
	}

	private _validateExports(): void {
		if (!this._exports?.length) return;

		const availableExportServiceIdentifiers: Set<ServiceIdentifier<unknown>> =
			this._getAvailableExportServiceIdentifiers();

		for (const exportServiceIdentifier of this._exports) {
			if (!availableExportServiceIdentifiers.has(exportServiceIdentifier)) {
				throw new Error(
					`Can't find export service identifier "${getServiceIdentifierName(exportServiceIdentifier)}" in "${this.displayName}".`,
				);
			}
		}
	}

	private _getAvailableExportServiceIdentifiers(): Set<
		ServiceIdentifier<unknown>
	> {
		const availableExportServiceIdentifiers: Set<ServiceIdentifier<unknown>> =
			new Set();
		for (const declaration of this._declarations ?? []) {
			availableExportServiceIdentifiers.add(declaration.serviceIdentifier);
		}
		for (const module of this._imports ?? []) {
			for (const exportServiceIdentifier of module.exports ?? []) {
				availableExportServiceIdentifiers.add(exportServiceIdentifier);
			}
		}
		return availableExportServiceIdentifiers;
	}
}
