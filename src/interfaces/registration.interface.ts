/**
 * @overview
 * @author AEPKILL
 * @created 2023-10-10 10:58:30
 */

import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { IProvider } from "./provider.interface";
import type { IDisposable } from "./disposable.interface";

export interface IRegistration {
  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): IDisposable;

  unRegister<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): void;

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;
  isRegistered<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): boolean;

  getProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T> | null;

  getAllProvider<T>(
    serviceIdentifier: ServiceIdentifier<T>
  ): Array<IProvider<T>>;

  getAllRegisteredServiceIdentifiers(): ServiceIdentifier<any>[];
}
