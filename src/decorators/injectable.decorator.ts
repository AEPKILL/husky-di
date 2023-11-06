/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-11 16:02:58
 */

import {
  InjectionMetadataKeyConst,
  ParamsMetadataKeyConst
} from "@/constants/metadata-key.const";
import { injectionMetadataMap } from "@/shared/instances";

import type { Constructor } from "@/types/constructor.type";
import type { InjectionMetadata } from "@/types/injection-metadata.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * @description
 * markup a class as a injectable class
 */
export const injectable: () => ClassDecorator = () =>
  ((target: Constructor<any>) => {
    if (injectionMetadataMap.has(target)) {
      throw new Error(
        `can't use  "@injectable()" decorate class "${target.name}" twice`
      );
    }

    const parametersServiceIdentifiers: Array<ServiceIdentifier<any>> =
      Reflect.getMetadata(ParamsMetadataKeyConst, target) || [];
    const ownParametersMetadata: Array<InjectionMetadata<any>> =
      Reflect.getMetadata(InjectionMetadataKeyConst, target) || [];
    const metadata: InjectionMetadata<any>[] = [];
    const parametersMetadataLength = Math.max(
      parametersServiceIdentifiers.length,
      ownParametersMetadata.length
    );

    for (let index = 0; index < parametersMetadataLength; index++) {
      if (ownParametersMetadata[index] !== void 0) {
        metadata.push(ownParametersMetadata[index]);
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
          `only can inject class type in constructor "${target.name}" parameter #${index}`
        );
      }

      metadata.push({ serviceIdentifier });
    }

    injectionMetadataMap.set(target, metadata);
  }) as ClassDecorator;
