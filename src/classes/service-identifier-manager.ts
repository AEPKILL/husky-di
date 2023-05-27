/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 17:25:47
 */

import { ServiceIdentifier } from "@/types/service-identifier.type";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";

export class ServiceIdentifierManager {
  private _serviceIdentifiers: Set<ServiceIdentifier<any>>;

  constructor() {
    this._serviceIdentifiers = new Set();
  }

  createServiceIdentifier<T>(id: string | symbol): ServiceIdentifier<T> {
    if (this._serviceIdentifiers.has(id)) {
      throw new Error(
        `service identifier: "${getServiceIdentifierName(
          id
        )}" is already exists.`
      );
    }

    this._serviceIdentifiers.add(id);

    return id;
  }

  static readonly defaultServiceIdentifierManager =
    new ServiceIdentifierManager();
  static createServiceIdentifier<T>(
    id: string | symbol
  ): ServiceIdentifier<T> {
    return this.defaultServiceIdentifierManager.createServiceIdentifier(id)
  }
}
