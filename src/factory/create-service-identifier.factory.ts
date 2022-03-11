/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 09:02:12
 */

import { ServiceIdentifierManager } from '../classes/service-identifier-manager';
import { ServiceIdentifier } from '../types/service-identifier.type';

let _defaultServiceIdentifierManager: ServiceIdentifierManager;
export function createServiceIdentifier<T>(
  id: string | symbol
): ServiceIdentifier<T> {
  if (_defaultServiceIdentifierManager === void 0) {
    _defaultServiceIdentifierManager = new ServiceIdentifierManager();
  }
  return _defaultServiceIdentifierManager.createServiceIdentifier<T>(id);
}
