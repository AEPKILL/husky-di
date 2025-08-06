/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:16:18
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: here is a parameter decorator, so we need to use any */

import { InjectionMetadataKeyConst } from "@/constants/metadata-key.const";
import type { ESParameterDecoratorContext } from "@/types/decorator-types";
import type { InjectionMetadata } from "@/types/injection-metadata.type";
import { createParameterDecorator } from "@/utils/decorator-factory";
import { metadataAccessor } from "@/utils/metadata-adapter";

export const tagged = <T>(metadata: InjectionMetadata<T>): any => {
	const tsImplementation = (
		// biome-ignore lint/complexity/noBannedTypes: here is a parameter decorator, so we need to use Object
		target: Object,
		_propertyKey: string | symbol | undefined,
		parameterIndex: number,
	) => {
		const parametersMetadata =
			metadataAccessor.getMetadata(InjectionMetadataKeyConst, target) || [];

		parametersMetadata[parameterIndex] = metadata;

		metadataAccessor.setMetadata(
			InjectionMetadataKeyConst,
			parametersMetadata,
			target,
		);
	};

	const esImplementation = (
		element: any,
		context: ESParameterDecoratorContext,
	) => {
		if (!context.metadata.parameters) {
			context.metadata.parameters = [];
		}
		context.metadata.parameters[context.index] = metadata;
		return element;
	};

	return createParameterDecorator(tsImplementation, esImplementation);
};
