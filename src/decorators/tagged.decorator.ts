/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:16:18
 */

import { InjectionMetadataKeyConst } from '@/constants/metadata-key.const';

import type { InjectionMetadata } from '@/types/injection-metadata.type';

export const tagged = <T>(
  metadata: InjectionMetadata<T>
): ParameterDecorator => {
  return (
    target: Object,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) => {
    const parametersMetadata =
      Reflect.getMetadata(InjectionMetadataKeyConst, target) || [];

    parametersMetadata[parameterIndex] = metadata;

    Reflect.defineMetadata(
      InjectionMetadataKeyConst,
      parametersMetadata,
      target
    );
  };
};
