/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-04 03:53:32
 */

import {
  InjectionMetadataKeyConst,
  ParamsMetadataKeyConst,
} from '../../constants/metadata-key.const';
import { Constructor } from '../../types/constructor.type';
import { ServiceIdentifier } from '../../types/service-identifier.type';

export function getParametersMetadata<T>(
  classConstructor: Constructor<T>
): Array<HuskyDi.InjectionMetadata<T>> {
  const parametersServiceIdentifiers: Array<ServiceIdentifier<any>> =
    Reflect.getMetadata(ParamsMetadataKeyConst, classConstructor) || [];

  const ownParametersMetadata: Array<HuskyDi.InjectionMetadata<T>> =
    Reflect.getMetadata(InjectionMetadataKeyConst, classConstructor) || [];

  return parametersServiceIdentifiers.map((serviceIdentifier, index) => {
    if (ownParametersMetadata[index] !== void 0) {
      return ownParametersMetadata[index];
    }

    return { serviceIdentifier };
  });
}
