/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:08:27
 */

import { ServiceIdentifier } from '../types/service-identifier.type';
import { tagged } from './tagged.decorator';

export const inject = <T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: Omit<HuskyDi.InjectionMetadata<T>, 'serviceIdentifier'>
): ParameterDecorator => {
  return tagged({ ...options, serviceIdentifier });
};
