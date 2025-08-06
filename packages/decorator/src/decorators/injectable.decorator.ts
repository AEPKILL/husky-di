/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-11 16:02:58
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: here is a class decorator, so we need to use any */

import type { Constructor, ServiceIdentifier } from "@husky-di/core";
import {
	InjectionMetadataKeyConst,
	ParamsMetadataKeyConst,
} from "@/constants/metadata-key.const";
import { injectionMetadataMap } from "@/shared/instances";
import type { ESClassElementDecoratorContext } from "@/types/decorator-types";
import type { InjectionMetadata } from "@/types/injection-metadata.type";
import { createClassDecorator } from "@/utils/decorator-factory";
import { metadataAccessor } from "@/utils/metadata-adapter";

/**
 * @description
 * 标记一个类为可注入类
 */
export const injectable: () => any = () => {
	// TypeScript 装饰器实现
	const tsImplementation = (target: Constructor<any>) => {
		if (injectionMetadataMap.has(target)) {
			throw new Error(
				`can't use  "@injectable()" decorate class "${target.name}" twice`,
			);
		}

		const parametersServiceIdentifiers: Array<ServiceIdentifier<any>> =
			metadataAccessor.getMetadata(ParamsMetadataKeyConst, target) || [];
		const parametersMetadata: Array<InjectionMetadata<any>> =
			metadataAccessor.getMetadata(InjectionMetadataKeyConst, target) || [];
		const metadata: InjectionMetadata<any>[] = [];
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

			/**
			 * can inject primary type
			 *
			 * e.g.:
			 * constructor(name: string) {}
			 *
			 * actually, we will use `new String()` to create a string instance
			 */
			if (typeof serviceIdentifier !== "function") {
				throw new Error(
					`only can inject class type in constructor "${target.name}" parameter #${index}`,
				);
			}

			// class type use LifecycleEnum.transient
			metadata.push({ serviceIdentifier });
		}

		injectionMetadataMap.set(target, metadata);
	};

	const esImplementation = (
		element: any,
		context: ESClassElementDecoratorContext,
	) => {
		context.addInitializer(() => {
			const target = context.metadata.target;
			if (target) {
				tsImplementation(target);
			}
		});
		return element;
	};

	return createClassDecorator(tsImplementation, esImplementation);
};
