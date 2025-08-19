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

/**
 * 构建模块容器的公共函数（保持向后兼容性）
 *
 * @param module 要构建的模块
 * @returns 构建好的容器
 */
export function build(module: IInternalModule): IContainer {
	const builder = new ModuleBuilder(module);
	return builder.build();
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

// ==================== ModuleBuilder 类 ====================

/**
 * 模块构建器类，整合模块验证和构建逻辑
 *
 * 在验证过程中收集服务标识符信息，并在构建过程中复用这些信息
 */
class ModuleBuilder {
	/** 要构建的模块 */
	private readonly module: IInternalModule;

	/** 服务标识符映射表（验证时构建，构建时复用） */
	private readonly serviceIdentifierMap = new Map<
		ServiceIdentifier<unknown>,
		ServiceInfo
	>();

	/** 可用服务标识符集合（验证时构建，构建时复用） */
	private readonly availableServiceIdentifiers = new Set<
		ServiceIdentifier<unknown>
	>();

	/** 导入模块的别名映射缓存 */
	private readonly importAliasesCache = new Map<
		IModule,
		Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>>
	>();

	constructor(module: IInternalModule) {
		this.module = module;
	}

	/**
	 * 构建模块容器
	 *
	 * @returns 构建好的容器
	 * @throws {Error} 当模块配置无效时抛出错误
	 */
	build(): IContainer {
		// 先进行验证，同时收集信息
		this.validateAndCollectInfo();

		// 如果已经构建过容器，直接返回
		if (this.module._internalContainer) {
			return this.module._internalContainer;
		}

		// 创建容器
		const container = createContainer(this.module.name);

		// 添加导出守卫中间件
		if (this.module.exports?.length) {
			container.use(createExportedGuardMiddlewareFactory(this.module.exports));
		}

		// 注册声明的服务
		this.registerDeclarations(container);

		// 注册导入的服务
		this.registerImports(container);

		return container;
	}

	/**
	 * 验证模块并收集信息
	 *
	 * @throws {Error} 当模块配置无效时抛出错误
	 */
	public validateAndCollectInfo(): void {
		// 清空之前的缓存
		this.serviceIdentifierMap.clear();
		this.availableServiceIdentifiers.clear();
		this.importAliasesCache.clear();

		// 验证导入模块的唯一性
		this.validateImportUniqueness();

		// 验证导出服务标识符的唯一性
		this.validateExportUniqueness();

		// 收集服务标识符信息并验证冲突
		this.collectServiceInfoAndValidateConflicts();

		// 验证导出服务标识符的有效性
		this.validateExportValidity();
	}

	/**
	 * 验证导入模块的唯一性
	 *
	 * @throws {Error} 当存在重复导入时抛出错误
	 */
	private validateImportUniqueness(): void {
		const { imports } = this.module;
		if (!imports?.length) return;

		const importModules = new Set<IModule>();

		for (const importModule of imports) {
			try {
				const importedModule = getModuleByImport(importModule);
				if (importModules.has(importedModule)) {
					throw new Error(
						`Duplicate import module: "${importedModule.displayName}" in "${this.module.displayName}".`,
					);
				}
				importModules.add(importedModule);
			} catch (error) {
				throw new Error(
					`Invalid module import in "${this.module.displayName}": ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}
	}

	/**
	 * 验证导出服务标识符的唯一性
	 *
	 * @throws {Error} 当存在重复导出时抛出错误
	 */
	private validateExportUniqueness(): void {
		const { exports } = this.module;
		if (!exports?.length) return;

		const existingExportServiceIdentifiers = new Set<
			ServiceIdentifier<unknown>
		>();

		for (const exported of exports) {
			if (existingExportServiceIdentifiers.has(exported)) {
				throw new Error(
					`Duplicate export service identifier: "${getServiceIdentifierName(exported)}" in "${this.module.displayName}".`,
				);
			}
			existingExportServiceIdentifiers.add(exported);
		}
	}

	/**
	 * 收集服务标识符信息并验证冲突
	 *
	 * @throws {Error} 当存在服务标识符冲突时抛出错误
	 */
	private collectServiceInfoAndValidateConflicts(): void {
		const { imports, declarations } = this.module;

		// 添加声明中的服务标识符
		if (declarations?.length) {
			for (const declaration of declarations) {
				this.serviceIdentifierMap.set(declaration.serviceIdentifier, {
					type: ServiceSourceTypeEnum.declaration,
					source: "declarations",
				});
				this.availableServiceIdentifiers.add(declaration.serviceIdentifier);
			}
		}

		// 检查导入模块的导出服务是否与声明冲突，并收集可用服务
		if (imports?.length) {
			for (const importModule of imports) {
				try {
					const importedModule = getModuleByImport(importModule);
					const exportedServices = importedModule.exports ?? [];

					// 构建并缓存别名映射
					const aliasesMap = this.buildAndCacheAliasesMap(
						importModule,
						importedModule,
					);

					for (const exported of exportedServices) {
						// 检查冲突
						const existing = this.serviceIdentifierMap.get(exported);
						if (existing) {
							const conflictInfo: ConflictInfo = {
								serviceName: getServiceIdentifierName(exported),
								currentModule: importedModule.displayName,
								existing,
								targetModule: this.module.displayName,
							};
							throw new Error(this.buildConflictMessage(conflictInfo));
						}

						// 记录服务信息
						this.serviceIdentifierMap.set(exported, {
							type: ServiceSourceTypeEnum.import,
							source: importedModule.displayName,
						});

						// 添加到可用服务集合（原始服务标识符）
						this.availableServiceIdentifiers.add(exported);

						// 如果有别名映射，也添加别名到可用服务集合
						const alias = aliasesMap.get(exported);
						if (alias) {
							this.availableServiceIdentifiers.add(alias);
						}
					}
				} catch (error) {
					throw new Error(
						`Failed to validate imports in "${this.module.displayName}": ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			}
		}
	}

	/**
	 * 验证导出服务标识符的有效性
	 *
	 * @throws {Error} 当导出的服务标识符不可用时抛出错误
	 */
	private validateExportValidity(): void {
		const { exports } = this.module;
		if (!exports?.length) return;

		// 检查所有导出的服务标识符是否都可用
		for (const exported of exports) {
			if (!this.availableServiceIdentifiers.has(exported)) {
				throw new Error(
					`Cannot export service identifier "${getServiceIdentifierName(exported)}" from "${this.module.displayName}": it is not declared in this module or imported from any imported module.`,
				);
			}
		}
	}

	/**
	 * 构建并缓存别名映射
	 *
	 * @param importModule 导入模块配置
	 * @param importedModule 实际导入的模块
	 * @returns 别名映射
	 */
	private buildAndCacheAliasesMap(
		importModule: NonNullable<CreateModuleOptions["imports"]>[number],
		importedModule: IModule,
	): Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>> {
		// 检查缓存
		const cached = this.importAliasesCache.get(importedModule);
		if (cached) return cached;

		// 构建别名映射
		const aliasesMap = new Map<
			ServiceIdentifier<unknown>,
			ServiceIdentifier<unknown>
		>();

		const moduleWithAliases = importModule as ModuleWithAliases;
		const aliases = moduleWithAliases.aliases ?? [];

		for (const alias of aliases) {
			aliasesMap.set(alias.serviceIdentifier, alias.as);
		}

		// 缓存映射
		this.importAliasesCache.set(importedModule, aliasesMap);

		return aliasesMap;
	}

	/**
	 * 注册声明的服务
	 *
	 * @param container 目标容器
	 */
	private registerDeclarations(container: IContainer): void {
		const { declarations } = this.module;
		if (!declarations?.length) return;

		for (const declaration of declarations) {
			const { serviceIdentifier, ...rest } = declaration;
			container.register(serviceIdentifier, rest);
		}
	}

	/**
	 * 注册导入的服务
	 *
	 * @param container 目标容器
	 */
	private registerImports(container: IContainer): void {
		const { imports } = this.module;
		if (!imports?.length) return;

		for (const importModule of imports) {
			const importedModule = getModuleByImport(importModule) as IInternalModule;

			// 确保导入的模块已经构建
			if (!importedModule._internalContainer) {
				importedModule._internalContainer = build(importedModule);
			}

			// 获取缓存的别名映射
			const aliasesMap =
				this.importAliasesCache.get(importedModule) ?? new Map();

			// 注册导入模块的导出服务
			for (const exported of importedModule.exports ?? []) {
				container.register(aliasesMap.get(exported) ?? exported, {
					useAlias: exported,
					getContainer(): IContainer {
						return importedModule._internalContainer as IContainer;
					},
				});
			}
		}
	}

	/**
	 * 构建服务标识符冲突的详细错误消息
	 *
	 * @param conflictInfo 包含冲突详细信息的对象
	 * @returns 格式化的错误消息字符串
	 */
	private buildConflictMessage(conflictInfo: ConflictInfo): string {
		const { serviceName, currentModule, existing, targetModule } = conflictInfo;

		const conflictType =
			existing.type === ServiceSourceTypeEnum.declaration
				? "declared in"
				: "exported by";
		const conflictSource = existing.source;

		return `Service identifier conflict: "${serviceName}" is exported by "${currentModule}" and ${conflictType} "${conflictSource}" in "${targetModule}".`;
	}
}
