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
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import { createModuleId } from "@/utils/uuid.utils";

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
	private _imports?: Array<IModule | ModuleWithAliases>;
	private _exports?: ServiceIdentifier<unknown>[];

	constructor(options: CreateModuleOptions) {
		this._id = withAliasId ?? createModuleId();
		this._name = options.name;
		this._declarations = options.declarations;
		this._imports = options.imports;
		this._exports = options.exports;
	}

	withAliases(aliases: Alias[]): ModuleWithAliases {
		return {
			module: this,
			aliases,
		};
	}
}
