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

		// 仅处理 class 类型的注册
		if (registration.type !== RegistrationTypeEnum.class) {
			return next(params);
		}

		const provider =
			registration.provider as CreateClassRegistrationOptions<any>["useClass"];
		const parametersMetadata = injectionMetadataMap.get(provider);
		if (!parametersMetadata) {
			throw new ResolveException(
				`The class ${provider.name} has no injection metadata, please make sure the class is decorated with @Injectable().`,
				resolveRecord,
			);
		}

		const parameters = parametersMetadata.map((metadata, index) => {
			const { serviceIdentifier, ...options } = metadata;
			resolveRecord.stashCurrent();
			resolveRecord.addRecordNode({
				type: ResolveRecordTypeEnum.message,
				message: `Resolve parameter #${index} of constructor "${provider.name}"`,
			});
			const instance = resolve(serviceIdentifier, options);
			resolveRecord.restoreCurrent();
			return instance;
		});

		return new provider(...parameters);
	},
};
