/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:16:18
 */

import { INJECTION_METADATA_KEY } from "@/constants/metadata-key.const";
import { DecoratorErrorCodeEnum } from "@/enums/decorator-error-code.enum";
import { DecoratorException } from "@/exceptions/decorator.exception";

import type { InjectionMetadata } from "@/types/injection-metadata.type";

export const tagged = <T>(
	metadata: InjectionMetadata<T>,
): ParameterDecorator => {
	validateInjectionMetadata(metadata);

	return (target, _propertyKey, parameterIndex) => {
		const parametersMetadata =
			Reflect.getMetadata(INJECTION_METADATA_KEY, target) || [];

		parametersMetadata[parameterIndex] = metadata;

		Reflect.defineMetadata(INJECTION_METADATA_KEY, parametersMetadata, target);
	};
};

function validateInjectionMetadata<T>(metadata: InjectionMetadata<T>): void {
	const serviceIdentifier = metadata?.serviceIdentifier;

	if (serviceIdentifier === undefined || serviceIdentifier === null) {
		throw new DecoratorException(
			DecoratorErrorCodeEnum.E_MISSING_SERVICE_IDENTIFIER,
			"Injection metadata must include a serviceIdentifier",
		);
	}

	const isValidServiceIdentifier =
		typeof serviceIdentifier === "function" ||
		typeof serviceIdentifier === "symbol" ||
		(typeof serviceIdentifier === "string" && serviceIdentifier.length > 0);

	if (!isValidServiceIdentifier) {
		throw new DecoratorException(
			DecoratorErrorCodeEnum.E_INVALID_SERVICE_IDENTIFIER,
			`Invalid service identifier: ${String(serviceIdentifier)}`,
		);
	}

	if (metadata.dynamic && metadata.ref) {
		throw new DecoratorException(
			DecoratorErrorCodeEnum.E_CONFLICTING_OPTIONS,
			`Cannot use both "dynamic" and "ref" options simultaneously`,
		);
	}
}
