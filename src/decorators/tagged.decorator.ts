/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:16:18
 */

import { InjectionMetadataKeyConst } from '../constants/metadata-key.const';

export const Tagged = <T>(
  metadata: HuskyDi.InjectionMetadata<T>
): ParameterDecorator => {
  return (
    target: Object,
    _propertyKey: string | symbol,
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
