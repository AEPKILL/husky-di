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
 * 构建模块容器的公共函数
 *
 * @param module 要构建的模块
 * @returns 构建好的容器
 */
export function build(module: IModule): IContainer {
	return new InternalModuleBuilder(module).build();
}

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
 * 优化的模块构建器类，针对一次性使用场景进行优化
 *
 * 主要优化点：
 * 1. 减少不必要的对象创建
 * 2. 简化缓存策略
 * 3. 优化方法职责分离
 * 4. 改进错误处理效率
 */
class InternalModuleBuilder {
	/** 要构建的模块 */
	private readonly module: IModule;

	/** 服务标识符映射表（验证时构建，构建时复用） */
	private readonly serviceIdentifierMap = new Map<
		ServiceIdentifier<unknown>,
		ServiceInfo
	>();

	/** 可用服务标识符集合（验证时构建，构建时复用） */
	private readonly availableServiceIdentifiers = new Set<
		ServiceIdentifier<unknown>
	>();

	/** 别名映射缓存（简化版本，仅在需要时创建） */
	private aliasesCache: Map<
		IModule,
		Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>>
	> | null = null;

	constructor(module: IModule) {
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

		// 创建容器
		const container = createContainer(this.module.name);

		// 添加导出守卫中间件
		container.use(
			createExportedGuardMiddlewareFactory(this.module.exports ?? []),
		);

		// 注册声明的服务
		this.registerDeclarations(container);

		// 注册导入的服务
		this.registerImports(container);

		// 清理缓存，释放内存
		this.cleanup();

		return container;
	}

	/**
	 * 验证模块并收集信息
	 *
	 * @throws {Error} 当模块配置无效时抛出错误
	 */
	private validateAndCollectInfo(): void {
		this.validateImportUniqueness();
		this.validateExportUniqueness();
		this.validateCircularDependencies();
		this.collectServiceInfoAndValidateConflicts();
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
	 * 验证循环依赖
	 *
	 * 使用深度优先搜索（DFS）算法检测模块之间的循环依赖
	 *
	 * @throws {Error} 当检测到循环依赖时抛出错误
	 */
	private validateCircularDependencies(): void {
		const visited = new Set<IModule>();
		const visiting = new Set<IModule>();
		const dependencyPath: IModule[] = [];

		this.detectCircularDependency(
			this.module,
			visited,
			visiting,
			dependencyPath,
		);
	}

	/**
	 * 递归检测循环依赖的核心方法
	 *
	 * @param currentModule 当前检查的模块
	 * @param visited 已完全访问过的模块集合（白色节点）
	 * @param visiting 正在访问中的模块集合（灰色节点）
	 * @param dependencyPath 当前依赖路径，用于构建错误信息
	 * @throws {Error} 当检测到循环依赖时抛出错误
	 */
	private detectCircularDependency(
		currentModule: IModule,
		visited: Set<IModule>,
		visiting: Set<IModule>,
		dependencyPath: IModule[],
	): void {
		// 如果当前模块已经完全访问过，直接返回
		if (visited.has(currentModule)) {
			return;
		}

		// 如果当前模块正在访问中，说明找到了循环依赖
		if (visiting.has(currentModule)) {
			const cycleStartIndex = dependencyPath.findIndex(
				(module) => module === currentModule,
			);
			const cyclePath = dependencyPath
				.slice(cycleStartIndex)
				.concat(currentModule)
				.map((module) => module.displayName)
				.join(" -> ");

			throw new Error(
				`Circular dependency detected: ${cyclePath}. Modules cannot have circular import relationships.`,
			);
		}

		// 标记当前模块为正在访问
		visiting.add(currentModule);
		dependencyPath.push(currentModule);

		// 递归检查所有导入的模块
		const imports = currentModule.imports ?? [];
		for (const importModule of imports) {
			const importedModule = getModuleByImport(importModule);
			this.detectCircularDependency(
				importedModule,
				visited,
				visiting,
				dependencyPath,
			);
		}

		// 移除当前模块的访问标记
		visiting.delete(currentModule);
		dependencyPath.pop();

		// 标记当前模块为已完全访问
		visited.add(currentModule);
	}

	/**
	 * 收集服务标识符信息并验证冲突
	 *
	 * @throws {Error} 当存在服务标识符冲突时抛出错误
	 */
	private collectServiceInfoAndValidateConflicts(): void {
		this.collectDeclarationServices();
		this.collectImportServices();
	}

	/**
	 * 收集声明中的服务标识符
	 */
	private collectDeclarationServices(): void {
		const { declarations } = this.module;
		if (!declarations?.length) return;

		for (const declaration of declarations) {
			this.serviceIdentifierMap.set(declaration.serviceIdentifier, {
				type: ServiceSourceTypeEnum.declaration,
				source: "declarations",
			});
			this.availableServiceIdentifiers.add(declaration.serviceIdentifier);
		}
	}

	/**
	 * 收集导入的服务标识符并验证冲突
	 *
	 * @throws {Error} 当存在服务标识符冲突时抛出错误
	 */
	private collectImportServices(): void {
		const { imports } = this.module;
		if (!imports?.length) return;

		for (const importModule of imports) {
			try {
				const importedModule = getModuleByImport(importModule);
				const exportedServices = importedModule.exports ?? [];

				// 构建别名映射（仅在需要时）
				const aliasesMap = this.buildAliasesMapIfNeeded(
					importModule,
					importedModule,
				);

				for (const exported of exportedServices) {
					// 检查冲突
					const existing = this.serviceIdentifierMap.get(exported);
					if (existing) {
						throw new Error(
							this.buildConflictMessage({
								serviceName: getServiceIdentifierName(exported),
								currentModule: importedModule.displayName,
								existing,
								targetModule: this.module.displayName,
							}),
						);
					}

					// 记录服务信息
					this.serviceIdentifierMap.set(exported, {
						type: ServiceSourceTypeEnum.import,
						source: importedModule.displayName,
					});

					// 如果有别名，只添加别名到可用服务集合，否则添加原始服务标识符
					const alias = aliasesMap?.get(exported);
					if (alias) {
						this.availableServiceIdentifiers.add(alias);
					} else {
						this.availableServiceIdentifiers.add(exported);
					}
				}
			} catch (error) {
				throw new Error(
					`Failed to validate imports in "${this.module.displayName}": ${error instanceof Error ? error.message : "Unknown error"}`,
				);
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
	 * 构建别名映射（仅在需要时）
	 *
	 * @param importModule 导入模块配置
	 * @param importedModule 实际导入的模块
	 * @returns 别名映射，如果没有别名则返回 null
	 */
	private buildAliasesMapIfNeeded(
		importModule: NonNullable<CreateModuleOptions["imports"]>[number],
		importedModule: IModule,
	): Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>> | null {
		// 检查是否有别名配置
		const moduleWithAliases = importModule as ModuleWithAliases;
		const aliases = moduleWithAliases.aliases;

		if (!aliases?.length) {
			return null;
		}

		// 延迟初始化缓存
		if (!this.aliasesCache) {
			this.aliasesCache = new Map();
		}

		// 检查缓存
		const cached = this.aliasesCache.get(importedModule);
		if (cached) return cached;

		// 构建别名映射
		const aliasesMap = new Map<
			ServiceIdentifier<unknown>,
			ServiceIdentifier<unknown>
		>();

		for (const alias of aliases) {
			aliasesMap.set(alias.serviceIdentifier, alias.as);
		}

		// 缓存映射
		this.aliasesCache.set(importedModule, aliasesMap);

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
			const importedModule = getModuleByImport(importModule);

			// 获取别名映射（仅在需要时）
			const aliasesMap = this.aliasesCache?.get(importedModule) ?? null;

			// 注册导入模块的导出服务
			for (const exported of importedModule.exports ?? []) {
				container.register(aliasesMap?.get(exported) ?? exported, {
					useAlias: exported,
					getContainer(): IContainer {
						return importedModule.container;
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

	/**
	 * 清理资源，释放内存
	 */
	private cleanup(): void {
		// 清理缓存
		this.aliasesCache?.clear();
		this.aliasesCache = null;

		// 清理集合和映射
		this.serviceIdentifierMap.clear();
		this.availableServiceIdentifiers.clear();
	}
}
