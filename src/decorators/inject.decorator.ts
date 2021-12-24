/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:08:27
 */

import { ServiceIdentifier } from '../types/service-identifier.type';
import { tagged } from './tagged.decorator';

/**
 * WARN: 
 * type  InjectOptions<T> = Omit<HuskyDi.InjectionMetadata<T>, 'serviceIdentifier'>
 * builded code: Pick<HuskyDi.InjectionMetadata<T>, .....>
 */
export interface InjectOptions<T>
  extends Omit<HuskyDi.InjectionMetadata<T>, 'serviceIdentifier'> {}

export const inject = <T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: InjectOptions<T>
): ParameterDecorator => {
  return tagged({ ...options, serviceIdentifier });
};
