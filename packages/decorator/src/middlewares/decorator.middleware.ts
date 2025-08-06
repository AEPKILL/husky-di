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
	name: "DecoratorMiddleware",
	executor: (params, next) => {
		const { registration, resolveRecord } = params;

		if (registration.type === RegistrationTypeEnum.class) {
			const provider =
				registration.provider as CreateClassRegistrationOptions<any>["useClass"];
			const parametersMetadata = injectionMetadataMap.get(provider);
			if (!parametersMetadata) {
				throw new ResolveException(
					`The class ${provider.name} has no injection metadata.`,
					resolveRecord,
				);
			}

			const parameters = parametersMetadata.map((metadata, index) => {
				const { serviceIdentifier } = metadata;
				resolveRecord.stashCurrent();
				resolveRecord.addRecordNode({
					type: ResolveRecordTypeEnum.message,
					message: `Resolve parameter #${index} of constructor "${provider.name}"`,
				});
				const instance = resolve(serviceIdentifier);
				resolveRecord.restoreCurrent();
				return instance;
			});

			return new provider(...parameters);
		}

		return next(params);
	},
};
