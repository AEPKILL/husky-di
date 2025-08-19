/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-12 19:22:37
 */

import {
	getServiceIdentifierName,
	type ServiceIdentifier,
} from "@husky-di/core";
import type { IModule } from "@/interfaces/module.interface";
import { getModuleByImport } from "@/utils/module.utils";

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
export function validateModule(module: IModule): void {
	const { imports, declarations, exports } = module;

	// 检查 imports 中是否有重复的 module
	const importModules = new Set<IModule>();
	for (const importModule of imports ?? []) {
		const importedModule = getModuleByImport(importModule);
		if (importModules.has(importedModule)) {
			throw new Error(
				`Duplicate import module: "${importedModule.displayName}" in "${module.displayName}".`,
			);
		}
		importModules.add(importedModule);
	}

	// 检查 exports 中是否存在重复的 Service Identifier
	const existingExportServiceIdentifiers = new Set<
		ServiceIdentifier<unknown>
	>();
	for (const exported of exports ?? []) {
		if (existingExportServiceIdentifiers.has(exported)) {
			throw new Error(
				`Duplicate export service identifier: "${getServiceIdentifierName(exported)}" in "${module.displayName}".`,
			);
		}
		existingExportServiceIdentifiers.add(exported);
	}

	// 检查  imports 和 declarations 中是否存在冲突的 Service Identifier
	const existingServiceIdentifiers = new Map<
		ServiceIdentifier<unknown>,
		ServiceInfo
	>();

	// 先添加 declarations 中的服务标识符
	for (const declaration of declarations ?? []) {
		existingServiceIdentifiers.set(declaration.serviceIdentifier, {
			type: ServiceSourceTypeEnum.declaration,
			source: "declarations",
		});
	}

	// 检查导入模块的导出服务是否与 declarations 冲突
	for (const importModule of importModules) {
		for (const exported of importModule.exports ?? []) {
			const existing = existingServiceIdentifiers.get(exported);
			if (existing) {
				const conflictInfo: ConflictInfo = {
					serviceName: getServiceIdentifierName(exported),
					currentModule: importModule.displayName,
					existing,
					targetModule: module.displayName,
				};
				throw new Error(buildConflictMessage(conflictInfo));
			}
			existingServiceIdentifiers.set(exported, {
				type: ServiceSourceTypeEnum.import,
				source: importModule.displayName,
			});
		}
	}

	// 检测 exports 中是否都是已声明的服务标识符
	for (const exported of exports ?? []) {
		if (!existingServiceIdentifiers.has(exported)) {
			throw new Error(
				`Cannot export service identifier "${getServiceIdentifierName(exported)}" from "${module.displayName}": it is not declared in this module or imported from any imported module.`,
			);
		}
	}
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
 * 类型守卫：检查服务信息是否为声明类型
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
