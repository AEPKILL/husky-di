/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:08:27
 */

import { ServiceIdentifier } from '../types/service-identifier.type';
import { Tagged } from './tagged.decorator';

export const Inject = <T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: Omit<HuskyDi.InjectionMetadata<T>, 'serviceIdentifier'>
): ParameterDecorator => {
  return Tagged({ ...options, serviceIdentifier });
};
