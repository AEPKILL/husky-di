/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 09:02:12
 */

import { ServiceIdentifierManager } from '../classes/service-identifier-manager';
import { ServiceIdentifier } from '../types/service-identifier.type';

let _serviceIdentifierManager: ServiceIdentifierManager;
export function createServiceIdentifier<T>(
  id: string | symbol
): ServiceIdentifier<T> {
  if (_serviceIdentifierManager === void 0) {
    _serviceIdentifierManager = new ServiceIdentifierManager();
  }
  return _serviceIdentifierManager.createServiceIdentifier<T>(id);
}
