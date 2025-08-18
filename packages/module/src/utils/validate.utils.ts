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

export function validateModule(module: IModule) {
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
				`Service identifier "${getServiceIdentifierName(exported)}" is not declared in "${module.displayName}".`,
			);
		}
	}
}

/**
 * 服务标识符来源类型
 */
enum ServiceSourceTypeEnum {
	declaration = "declaration",
	import = "import",
}

/**
 * 服务标识符信息
 */
interface ServiceInfo {
	readonly type: ServiceSourceTypeEnum;
	readonly source: string;
}

/**
 * 冲突信息
 */
interface ConflictInfo {
	readonly serviceName: string;
	readonly currentModule: string;
	readonly existing: ServiceInfo;
	readonly targetModule: string;
}

/**
 * 类型守卫：检查是否为声明类型
 * @param serviceInfo 服务信息
 * @returns 是否为声明类型
 */
function isDeclarationType(
	serviceInfo: ServiceInfo,
): serviceInfo is ServiceInfo & { type: ServiceSourceTypeEnum.declaration } {
	return serviceInfo.type === ServiceSourceTypeEnum.declaration;
}

/**
 * 构建服务标识符冲突的错误消息
 * @param conflictInfo 冲突信息
 * @returns 格式化的错误消息
 */
function buildConflictMessage(conflictInfo: ConflictInfo): string {
	const { serviceName, currentModule, existing, targetModule } = conflictInfo;

	const conflictType = isDeclarationType(existing)
		? "declared in"
		: "exported by";
	const conflictSource = existing.source;

	return `Service identifier conflict: "${serviceName}" is exported by "${currentModule}" and ${conflictType} "${conflictSource}" in "${targetModule}".`;
}
