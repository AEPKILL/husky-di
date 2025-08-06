/**
 * @overview
 * @author AEPKILL
 * @created 2025-01-27
 */

// 导出常量
export {
	InjectionMetadataKeyConst,
	ParamsMetadataKeyConst,
} from "@/constants/metadata-key.const";
// 导出类型
export type { InjectOptions } from "@/decorators/inject.decorator";
export { inject } from "@/decorators/inject.decorator";
// 导出装饰器
export { injectable } from "@/decorators/injectable.decorator";
export { tagged } from "@/decorators/tagged.decorator";
export type {
	DecoratorFactoryOptions,
	DecoratorMode,
	MetadataAccessor,
	UnifiedClassDecorator,
	UnifiedParameterDecorator,
} from "@/types/decorator-types";
// 导出工具
export {
	detectDecoratorMode,
	detectDecoratorModeFromParams,
	getDecoratorConfig,
	isESDecorator,
	supportsReflectMetadata,
} from "@/utils/decorator-detector";
export {
	createClassDecorator,
	createParameterDecorator,
} from "@/utils/decorator-factory";
export {
	getMetadataAccessor,
	metadataAccessor,
} from "@/utils/metadata-adapter";
