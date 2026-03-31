/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:16:18
 */

import { INJECTION_METADATA_KEY } from "@/constants/metadata-key.const";

import type { InjectionMetadata } from "@/types/injection-metadata.type";

export const tagged = <T>(
	metadata: InjectionMetadata<T>,
): ParameterDecorator => {
	return (target, _propertyKey, parameterIndex) => {
		const parametersMetadata =
			Reflect.getMetadata(INJECTION_METADATA_KEY, target) || [];

		parametersMetadata[parameterIndex] = metadata;

		Reflect.defineMetadata(INJECTION_METADATA_KEY, parametersMetadata, target);
	};
};
