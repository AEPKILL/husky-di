/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-11 16:02:58
 */

import type { Constructor, ServiceIdentifier } from "@husky-di/core";
import {
	InjectionMetadataKeyConst,
	ParamsMetadataKeyConst,
} from "@/constants/metadata-key.const";
import { injectionMetadataMap } from "@/shared/instances";
import type { InjectionMetadata } from "@/types/injection-metadata.type";

/**
 * @description
 * markup a class as a injectable class
 */
export const injectable: () => ClassDecorator = () =>
	((target: Constructor<unknown>) => {
		if (injectionMetadataMap.has(target)) {
			throw new Error(
				`can't use  "@injectable()" decorate class "${target.name}" twice`,
			);
		}

		const parametersServiceIdentifiers: Array<ServiceIdentifier<unknown>> =
			Reflect.getMetadata(ParamsMetadataKeyConst, target) || [];
		const parametersMetadata: Array<InjectionMetadata<unknown>> =
			Reflect.getMetadata(InjectionMetadataKeyConst, target) || [];
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
	}) as ClassDecorator;
