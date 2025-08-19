/**
 * @overview 模块工具函数，包含模块构建和验证逻辑
 * @author AEPKILL
 * @created 2025-08-12 19:57:50
 */

import {
	createContainer,
	getServiceIdentifierName,
	type IContainer,
	type ServiceIdentifier,
} from "@husky-di/core";
import { createExportedGuardMiddlewareFactory } from "@/factories/exported-guard-middleware.factory";
import { Module } from "@/impls/module";
import type {
	CreateModuleOptions,
	IInternalModule,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";

/**
 * 类型守卫：检查模块导入是否包含别名映射
 *
 * @param moduleImport 模块导入对象
 * @returns 如果包含别名映射则返回 true，否则返回 false
 */
export function isModuleWithAliases(
	moduleImport: NonNullable<CreateModuleOptions["imports"]>[number],
): moduleImport is ModuleWithAliases {
	return (moduleImport as ModuleWithAliases).module instanceof Module;
}

/**
 * 从模块导入中获取实际的模块对象
 *
 * @param moduleImport 模块导入（可能包含别名）
 * @returns 实际的模块对象
 */
export function getModuleByImport(
	moduleImport: NonNullable<CreateModuleOptions["imports"]>[number],
): IModule {
	return isModuleWithAliases(moduleImport) ? moduleImport.module : moduleImport;
}

export function build(module: IInternalModule): IContainer {
	validateModule(module);

	if (module._internalContainer) return module._internalContainer;

	const container = createContainer(module.name);
	if (module.exports?.length) {
		container.use(createExportedGuardMiddlewareFactory(module.exports));
	}

	for (const declaration of module.declarations ?? []) {
		const { serviceIdentifier, ...rest } = declaration;
		container.register(serviceIdentifier, rest);
	}

	for (const it of module.imports ?? []) {
		const importedModule = getModuleByImport(it) as IInternalModule;
		if (!importedModule._internalContainer) {
			importedModule._internalContainer = build(importedModule);
		}

		// 构建别名映射
		const aliasesMap: Map<
			ServiceIdentifier<unknown>,
			ServiceIdentifier<unknown>
		> = new Map();
		for (const alias of (it as ModuleWithAliases)?.aliases || []) {
			aliasesMap.set(alias.serviceIdentifier, alias.as);
		}

		for (const exported of importedModule.exports ?? []) {
			container.register(aliasesMap.get(exported) ?? exported, {
				useAlias: exported,
				getContainer(): IContainer {
					return importedModule._internalContainer as IContainer;
				},
			});
		}
	}

	return container;
}

// ==================== 验证相关类型和枚举 ====================

/**
 * 服务标识符来源类型枚举
 */
enum ServiceSourceTypeEnum {
	/** 在模块中声明的服务 */
	declaration = "declaration",
	/** 从其他模块导入的服务 */
	import = "import",
}

/**
 * 服务标识符信息接口
 */
interface ServiceInfo {
	/** 服务来源类型 */
	readonly type: ServiceSourceTypeEnum;
	/** 服务来源描述（模块名称或 "declarations"） */
	readonly source: string;
}

/**
 * 服务标识符冲突信息接口
 */
interface ConflictInfo {
	/** 冲突的服务名称 */
	readonly serviceName: string;
	/** 当前冲突的模块名称 */
	readonly currentModule: string;
	/** 已存在的服务信息 */
	readonly existing: ServiceInfo;
	/** 目标模块名称 */
	readonly targetModule: string;
}

/**
 * 验证结果接口
 */
interface ValidationResult {
	/** 是否验证通过 */
	readonly isValid: boolean;
	/** 错误消息（如果验证失败） */
	readonly error?: string;
}

// ==================== 验证函数 ====================

/**
 * 验证模块的配置是否正确
 *
 * 执行以下验证：
 * 1. 检查导入模块是否有重复
 * 2. 检查导出服务标识符是否有重复
 * 3. 检查导入和声明之间是否存在服务标识符冲突
 * 4. 检查导出的服务标识符是否都已声明或导入
 *
 * @param module 要验证的模块对象
 * @throws {Error} 当模块配置无效时抛出错误
 */
function validateModule(module: IModule): void {
	const result = validateModuleInternal(module);
	if (!result.isValid) {
		throw new Error(result.error);
	}
}

/**
 * 内部验证函数，返回验证结果而不是抛出异常
 *
 * @param module 要验证的模块对象
 * @returns 验证结果
 */
function validateModuleInternal(module: IModule): ValidationResult {
	// 验证导入模块的唯一性
	const importValidation = validateImportUniqueness(module);
	if (!importValidation.isValid) {
		return importValidation;
	}

	// 验证导出服务标识符的唯一性
	const exportValidation = validateExportUniqueness(module);
	if (!exportValidation.isValid) {
		return exportValidation;
	}

	// 验证服务标识符冲突
	const conflictValidation = validateServiceIdentifierConflicts(module);
	if (!conflictValidation.isValid) {
		return conflictValidation;
	}

	// 验证导出服务标识符的有效性
	const exportValidityValidation = validateExportValidity(module);
	if (!exportValidityValidation.isValid) {
		return exportValidityValidation;
	}

	return { isValid: true };
}

/**
 * 验证导入模块的唯一性
 *
 * @param module 要验证的模块对象
 * @returns 验证结果
 */
function validateImportUniqueness(module: IModule): ValidationResult {
	const { imports } = module;
	if (!imports?.length) {
		return { isValid: true };
	}

	const importModules = new Set<IModule>();

	for (const importModule of imports) {
		try {
			const importedModule = getModuleByImport(importModule);
			if (importModules.has(importedModule)) {
				return {
					isValid: false,
					error: `Duplicate import module: "${importedModule.displayName}" in "${module.displayName}".`,
				};
			}
			importModules.add(importedModule);
		} catch (error) {
			return {
				isValid: false,
				error: `Invalid module import in "${module.displayName}": ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	}

	return { isValid: true };
}

/**
 * 验证导出服务标识符的唯一性
 *
 * @param module 要验证的模块对象
 * @returns 验证结果
 */
function validateExportUniqueness(module: IModule): ValidationResult {
	const { exports } = module;
	if (!exports?.length) {
		return { isValid: true };
	}

	const existingExportServiceIdentifiers = new Set<
		ServiceIdentifier<unknown>
	>();

	for (const exported of exports) {
		if (existingExportServiceIdentifiers.has(exported)) {
			return {
				isValid: false,
				error: `Duplicate export service identifier: "${getServiceIdentifierName(exported)}" in "${module.displayName}".`,
			};
		}
		existingExportServiceIdentifiers.add(exported);
	}

	return { isValid: true };
}

/**
 * 验证服务标识符冲突
 *
 * @param module 要验证的模块对象
 * @returns 验证结果
 */
function validateServiceIdentifierConflicts(module: IModule): ValidationResult {
	const { imports, declarations } = module;

	// 构建服务标识符映射，避免重复遍历
	const serviceIdentifierMap = new Map<
		ServiceIdentifier<unknown>,
		ServiceInfo
	>();

	// 添加声明中的服务标识符
	if (declarations?.length) {
		for (const declaration of declarations) {
			serviceIdentifierMap.set(declaration.serviceIdentifier, {
				type: ServiceSourceTypeEnum.declaration,
				source: "declarations",
			});
		}
	}

	// 检查导入模块的导出服务是否与声明冲突
	if (imports?.length) {
		for (const importModule of imports) {
			try {
				const importedModule = getModuleByImport(importModule);
				const exportedServices = importedModule.exports ?? [];

				for (const exported of exportedServices) {
					const existing = serviceIdentifierMap.get(exported);
					if (existing) {
						const conflictInfo: ConflictInfo = {
							serviceName: getServiceIdentifierName(exported),
							currentModule: importedModule.displayName,
							existing,
							targetModule: module.displayName,
						};
						return {
							isValid: false,
							error: buildConflictMessage(conflictInfo),
						};
					}

					serviceIdentifierMap.set(exported, {
						type: ServiceSourceTypeEnum.import,
						source: importedModule.displayName,
					});
				}
			} catch (error) {
				return {
					isValid: false,
					error: `Failed to validate imports in "${module.displayName}": ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		}
	}

	return { isValid: true };
}

/**
 * 验证导出服务标识符的有效性
 *
 * @param module 要验证的模块对象
 * @returns 验证结果
 */
function validateExportValidity(module: IModule): ValidationResult {
	const { exports, imports, declarations } = module;
	if (!exports?.length) {
		return { isValid: true };
	}

	// 构建所有可用的服务标识符集合
	const availableServiceIdentifiers = new Set<ServiceIdentifier<unknown>>();

	// 添加声明中的服务标识符
	if (declarations?.length) {
		for (const declaration of declarations) {
			availableServiceIdentifiers.add(declaration.serviceIdentifier);
		}
	}

	// 添加导入模块的导出服务标识符（包括别名）
	if (imports?.length) {
		for (const importModule of imports) {
			const importedModule = getModuleByImport(importModule);
			const exportedServices = importedModule.exports ?? [];

			// 检查是否有别名映射
			const moduleWithAliases = importModule as ModuleWithAliases;
			const aliases = moduleWithAliases.aliases ?? [];

			// 构建别名映射
			const aliasesMap = new Map<
				ServiceIdentifier<unknown>,
				ServiceIdentifier<unknown>
			>();
			for (const alias of aliases) {
				aliasesMap.set(alias.serviceIdentifier, alias.as);
			}

			for (const exported of exportedServices) {
				// 添加原始服务标识符
				availableServiceIdentifiers.add(exported);

				// 如果有别名映射，也添加别名
				const alias = aliasesMap.get(exported);
				if (alias) {
					availableServiceIdentifiers.add(alias);
				}
			}
		}
	}

	// 检查所有导出的服务标识符是否都可用
	for (const exported of exports) {
		if (!availableServiceIdentifiers.has(exported)) {
			return {
				isValid: false,
				error: `Cannot export service identifier "${getServiceIdentifierName(exported)}" from "${module.displayName}": it is not declared in this module or imported from any imported module.`,
			};
		}
	}

	return { isValid: true };
}

/**
 * 类型守卫：检查服务信息是否为声明类型
 *
 * @param serviceInfo 服务信息对象
 * @returns 如果服务信息为声明类型则返回 true，否则返回 false
 */
function isDeclarationType(
	serviceInfo: ServiceInfo,
): serviceInfo is ServiceInfo & { type: ServiceSourceTypeEnum.declaration } {
	return serviceInfo.type === ServiceSourceTypeEnum.declaration;
}

/**
 * 构建服务标识符冲突的详细错误消息
 *
 * @param conflictInfo 包含冲突详细信息的对象
 * @returns 格式化的错误消息字符串
 */
function buildConflictMessage(conflictInfo: ConflictInfo): string {
	const { serviceName, currentModule, existing, targetModule } = conflictInfo;

	const conflictType = isDeclarationType(existing)
		? "declared in"
		: "exported by";
	const conflictSource = existing.source;

	return `Service identifier conflict: "${serviceName}" is exported by "${currentModule}" and ${conflictType} "${conflictSource}" in "${targetModule}".`;
}
