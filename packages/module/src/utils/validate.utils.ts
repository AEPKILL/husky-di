/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-09 15:30:30
 */

import type { ServiceIdentifier } from "@husky-di/core";
import { getServiceIdentifierName } from "@husky-di/core";
import type { IModule } from "@/interfaces/module.interface";

/**
 * 模块导出验证参数
 */
export interface ModuleExportValidationOptions {
	/** 模块名称 */
	moduleName: string;
	/** 模块ID */
	moduleId: string | symbol;
	/** 导出的标识符数组 */
	exports: ServiceIdentifier<unknown>[];
	/** 声明的标识符数组 */
	declarations: ServiceIdentifier<unknown>[];
	/** 导入的模块数组 */
	imports?: IModule[];
}

/**
 * 模块导出验证结果
 */
export interface ModuleExportValidationResult {
	/** 是否验证通过 */
	isValid: boolean;
	/** 错误信息（验证失败时） */
	errorMessage?: string;
	/** 无效的导出标识符 */
	invalidExportId?: ServiceIdentifier<unknown>;
}

/**
 * 验证模块的导出标识符是否有效
 * @param options 验证选项
 * @returns 验证结果
 */
export function validateModuleExports(
	options: ModuleExportValidationOptions,
): ModuleExportValidationResult {
	const { moduleName, moduleId, exports, declarations, imports } = options;

	// 早期返回：没有导出需要验证
	if (!exports || exports.length === 0) {
		return { isValid: true };
	}

	const availableIds = getAvailableServiceIdentifiers(declarations, imports);

	// 验证每个导出标识符
	for (const exportId of exports) {
		if (!availableIds.includes(exportId)) {
			const errorMessage = buildExportValidationErrorMessage(
				moduleName,
				moduleId,
				exportId,
				declarations,
				imports,
			);
			return {
				isValid: false,
				errorMessage,
				invalidExportId: exportId,
			};
		}
	}

	return { isValid: true };
}

/**
 * 获取所有可用的服务标识符
 * @param declarations 声明的标识符数组
 * @param imports 导入的模块数组
 * @returns 可用的标识符数组
 */
export function getAvailableServiceIdentifiers(
	declarations: ServiceIdentifier<unknown>[],
	imports?: IModule[],
): ServiceIdentifier<unknown>[] {
	const importExportIds: ServiceIdentifier<unknown>[] = [];

	// 收集所有 imports Module 的 exports
	if (imports) {
		for (const importModule of imports) {
			if (importModule.exports) {
				importExportIds.push(...importModule.exports);
			}
		}
	}

	return [...declarations, ...importExportIds];
}

/**
 * 构建导出验证错误消息
 * @param moduleName 模块名称
 * @param moduleId 模块ID
 * @param exportId 无效的导出标识符
 * @param declarations 声明的标识符数组
 * @param imports 导入的模块数组
 * @returns 错误消息
 */
function buildExportValidationErrorMessage(
	moduleName: string,
	moduleId: string | symbol,
	exportId: ServiceIdentifier<unknown>,
	declarations: ServiceIdentifier<unknown>[],
	imports?: IModule[],
): string {
	const displayName = `${moduleName}#${String(moduleId)}`;
	const baseMessage = `Module "${displayName}" cannot export "${getServiceIdentifierName(exportId)}" because it is not declared or imported.`;

	const importExportIds = getImportExportIds(imports);
	const details = buildErrorDetails(declarations, importExportIds);
	const suggestion = buildSuggestion(declarations, importExportIds, exportId);

	return `${baseMessage}\nDetails:${details}${suggestion}`;
}

/**
 * 获取导入模块的导出标识符
 * @param imports 导入的模块数组
 * @returns 导入导出的标识符数组
 */
function getImportExportIds(imports?: IModule[]): ServiceIdentifier<unknown>[] {
	const importExportIds: ServiceIdentifier<unknown>[] = [];

	if (imports) {
		for (const importModule of imports) {
			if (importModule.exports) {
				importExportIds.push(...importModule.exports);
			}
		}
	}

	return importExportIds;
}

/**
 * 构建错误详情
 * @param declarationIds 声明的标识符数组
 * @param importExportIds 导入导出的标识符数组
 * @returns 错误详情字符串
 */
function buildErrorDetails(
	declarationIds: ServiceIdentifier<unknown>[],
	importExportIds: ServiceIdentifier<unknown>[],
): string {
	const availableDeclarations =
		declarationIds.length > 0
			? `\n  Available declarations: ${declarationIds.map((id) => getServiceIdentifierName(id)).join(", ")}`
			: "\n  No declarations available";

	const availableImports =
		importExportIds.length > 0
			? `\n  Available imports: ${importExportIds.map((id) => getServiceIdentifierName(id)).join(", ")}`
			: "\n  No imports available";

	return `${availableDeclarations}${availableImports}`;
}

/**
 * 构建智能建议
 * @param declarationIds 可用的声明标识符
 * @param importExportIds 可用的导入导出标识符
 * @param exportId 无效的导出标识符
 * @returns 建议字符串
 */
function buildSuggestion(
	declarationIds: ServiceIdentifier<unknown>[],
	importExportIds: ServiceIdentifier<unknown>[],
	exportId: ServiceIdentifier<unknown>,
): string {
	// 早期返回：没有任何可用的标识符
	const hasNoDeclarations = declarationIds.length === 0;
	const hasNoImports = importExportIds.length === 0;

	if (hasNoDeclarations && hasNoImports) {
		return "\n  Suggestion: Add declarations or import modules with exports before defining exports.";
	}

	// 没有声明
	if (hasNoDeclarations) {
		return "\n  Suggestion: Add declarations to this module or check if the import modules have the required exports.";
	}

	// 没有导入
	if (hasNoImports) {
		return "\n  Suggestion: Import modules with the required exports or add the export to declarations.";
	}

	// 尝试找到最相似的标识符
	const allAvailable = [...declarationIds, ...importExportIds];
	const similarIds = allAvailable.filter((id) => {
		const idString = String(id).toLowerCase();
		const exportIdString = String(exportId).toLowerCase();
		const isSimilar =
			idString.includes(exportIdString) || exportIdString.includes(idString);
		return isSimilar;
	});

	// 早期返回：找到相似标识符
	if (similarIds.length > 0) {
		return `\n  Suggestion: Did you mean one of these? ${similarIds.map((id) => getServiceIdentifierName(id)).join(", ")}`;
	}

	// 默认建议
	return "\n  Suggestion: Check spelling and ensure the export identifier matches exactly with declarations or imported exports.";
}
