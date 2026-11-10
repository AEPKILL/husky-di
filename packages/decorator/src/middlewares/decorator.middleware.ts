/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-07 00:23:43 22:51:38
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: need to use any to avoid type errors */

import {
	CodedException,
	type CreateClassRegistrationOptions,
	RegistrationTypeEnum,
	ResolveException,
	type ResolveMiddleware,
	ResolveRecordTypeEnum,
	resolve,
} from "@husky-di/core";
import { DecoratorErrorCodeEnum } from "@/enums/decorator-error-code.enum";
import { injectionMetadataMap } from "@/shared/instances";

export const decoratorMiddleware: ResolveMiddleware<any, any> = {
	name: Symbol("DecoratorMiddleware"),
	executor: (params, next) => {
		const { registration, resolveRecord } = params;

		// Only process class type registrations
		if (registration.type !== RegistrationTypeEnum.class) {
			return next(params);
		}

		const provider =
			registration.provider as CreateClassRegistrationOptions<any>["useClass"];

		// if the provider is a primitive constructor, return a new instance of the constructor
		if (isPrimitiveConstructor(provider)) {
			return new provider();
		}

		const parametersMetadata = injectionMetadataMap.get(provider);
		if (!parametersMetadata) {
			throw new ResolveException(
				DecoratorErrorCodeEnum.E_NOT_INJECTABLE,
				`Class '${provider.name}' must be decorated with @Injectable()`,
				resolveRecord,
			);
		}

		const parameters = parametersMetadata.map((metadata, index) => {
			const { serviceIdentifier, ...options } = metadata;
			resolveRecord._internalStashCurrent();
			try {
				resolveRecord.addRecordNode({
					type: ResolveRecordTypeEnum.message,
					message: `Resolve parameter #${index} of constructor "${provider.name}"`,
				});
				return resolve(serviceIdentifier, options);
			} catch (error: unknown) {
				if (ResolveException.isResolveException(error)) {
					throw error;
				}
				if (CodedException.isCodedException(error)) {
					throw new ResolveException(
						error.code,
						error.detail,
						resolveRecord,
						error,
					);
				}
				throw error;
			} finally {
				resolveRecord._internalRestoreCurrent();
			}
		});

		return new provider(...parameters);
	},
};

function isPrimitiveConstructor(value: unknown) {
	return (
		value === String ||
		value === Number ||
		value === Boolean ||
		value === Symbol ||
		value === BigInt
	);
}
