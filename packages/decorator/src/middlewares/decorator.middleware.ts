/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-06 22:51:38
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: need to use any to avoid type errors */

import {
	type CreateClassRegistrationOptions,
	RegistrationTypeEnum,
	ResolveException,
	type ResolveMiddleware,
	ResolveRecordTypeEnum,
	resolve,
} from "@husky-di/core";
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
				`Class '${provider.name}' must be decorated with @Injectable()`,
				resolveRecord,
			);
		}

		const parameters = parametersMetadata.map((metadata, index) => {
			const { serviceIdentifier, ...options } = metadata;
			resolveRecord._internalStashCurrent();
			resolveRecord.addRecordNode({
				type: ResolveRecordTypeEnum.message,
				message: `Resolve parameter #${index} of constructor "${provider.name}"`,
			});
			const instance = resolve(serviceIdentifier, options);
			resolveRecord._internalRestoreCurrent();
			return instance;
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
