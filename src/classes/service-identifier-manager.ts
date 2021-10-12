/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 17:25:47
 */

import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { ServiceIdentifier } from '../types/service-identifier.type';

export class ServiceIdentifierManager {
  private _serviceIdentifiers: Set<ServiceIdentifier<any>>;

  constructor() {
    this._serviceIdentifiers = new Set();
  }

  createServiceIdentifier<T>(id: string | symbol) {
    if (this._serviceIdentifiers.has(id)) {
      throw new Error(
        `service identifier: "${getServiceIdentifierName(
          id
        )}" is already exists.`
      );
    }

    this._serviceIdentifiers.add(id);

    return id as ServiceIdentifier<T>;
  }
}
