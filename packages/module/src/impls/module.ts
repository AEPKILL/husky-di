/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 14:51:09
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type {
	Alias,
	CreateModuleOptions,
	Declaration,
	IModule,
} from "@/interfaces/module.interface";
import { createModuleId } from "@/utils/uuid.utils";
import { validateModuleExports } from "@/utils/validate.utils";

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
		return `${this._name}#${String(this._id)}`;
	}

	private _id: string | symbol;
	private _name: string;
	private _declarations?: Declaration<unknown>[];
	private _imports?: IModule[];
	private _exports?: ServiceIdentifier<unknown>[];

	constructor(options: CreateModuleOptions) {
		this._id = createModuleId();
		this._name = options.name;
		this._declarations = options.declarations;
		this._imports = options.imports;
		this._exports = options.exports;

		// 验证 exports 必须在 declarations 中或在 imports Module 的 exports 中
		if (this._exports && this._exports.length > 0) {
			this._validateExports();
		}
	}

	withAlias(_alias: Alias[]): IModule {
		throw new Error("Not implemented");
	}

	/**
	 * 验证模块导出
	 */
	private _validateExports(): void {
		const exports = this._exports ?? [];
		const declarationIds =
			this._declarations?.map((d) => d.serviceIdentifier) || [];

		const validationResult = validateModuleExports({
			moduleName: this._name,
			moduleId: this._id,
			exports,
			declarations: declarationIds,
			imports: this._imports,
		});

		if (!validationResult.isValid && validationResult.errorMessage) {
			throw new Error(validationResult.errorMessage);
		}
	}
}
