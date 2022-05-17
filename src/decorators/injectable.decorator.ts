/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-11 16:02:58
 */

import { getParametersMetadata } from '../shared/helpers/reflection.helper';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { injectionMetadataMap } from '../shared/instances';
import { Constructor } from '../types/constructor.type';

export const injectable = ((target: Constructor<any>) => {
  if (injectionMetadataMap.has(target)) {
    throw new Error(
      `can't use  "@injectable" decorator on constructor "${getServiceIdentifierName(
        target
      )}" twice`
    );
  }

  injectionMetadataMap.set(target, getParametersMetadata(target));
}) as ClassDecorator;
