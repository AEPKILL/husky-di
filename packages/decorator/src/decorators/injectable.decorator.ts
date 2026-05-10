/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-11 16:02:58
 */

import type { Constructor, ServiceIdentifier } from "@husky-di/core";
import {
	INJECTION_METADATA_KEY,
	PARAMS_METADATA_KEY,
} from "@/constants/metadata-key.const";
import { DecoratorErrorCodeEnum } from "@/enums/decorator-error-code.enum";
import { DecoratorException } from "@/exceptions/decorator.exception";
import { injectionMetadataMap } from "@/shared/instances";
import type { InjectionMetadata } from "@/types/injection-metadata.type";

const NON_CLASS_PARAMETER_TYPES = new Set<unknown>([
	String,
	Number,
	Boolean,
	BigInt,
	Symbol,
	Object,
]);

/**
 * @description
 * Mark a class as an injectable class
 */
export const injectable: () => ClassDecorator = () =>
	((target: Constructor<unknown>) => {
		if (injectionMetadataMap.has(target)) {
			throw new DecoratorException(
				DecoratorErrorCodeEnum.E_DUPLICATE_INJECTABLE,
				`Class '${target.name}' is already decorated with @Injectable()`,
			);
		}

		const parametersServiceIdentifiers: Array<ServiceIdentifier<unknown>> =
			Reflect.getMetadata(PARAMS_METADATA_KEY, target) || [];
		const parametersMetadata: Array<InjectionMetadata<unknown>> =
			Reflect.getMetadata(INJECTION_METADATA_KEY, target) || [];
		const metadata: InjectionMetadata<unknown>[] = [];
		const parametersMetadataLength = Math.max(
			parametersServiceIdentifiers.length,
			parametersMetadata.length,
		);

		for (let index = 0; index < parametersMetadataLength; index++) {
			if (parametersMetadata[index] !== void 0) {
				metadata.push(parametersMetadata[index]);
				continue;
			}

			const serviceIdentifier = parametersServiceIdentifiers[index];

			if (
				typeof serviceIdentifier !== "function" ||
				NON_CLASS_PARAMETER_TYPES.has(serviceIdentifier)
			) {
				throw new DecoratorException(
					DecoratorErrorCodeEnum.E_NON_CLASS_PARAMETER,
					`Constructor '${target.name}' parameter #${index} must be a class type`,
				);
			}

			// Class type uses LifecycleEnum.transient
			metadata.push({ serviceIdentifier });
		}

		if (metadata.length !== parametersMetadataLength) {
			throw new DecoratorException(
				DecoratorErrorCodeEnum.E_INCOMPLETE_METADATA,
				`Constructor '${target.name}' has incomplete injection metadata`,
			);
		}

		injectionMetadataMap.set(target, metadata);
	}) as ClassDecorator;
