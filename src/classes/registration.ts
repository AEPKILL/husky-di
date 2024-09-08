/**
 * @overview
 * @author AEPKILL
 * @created 2023-10-10 11:01:57
 */

import type {
  IRegistration,
  IsRegisteredOptions
} from "@/interfaces/registration.interface";
import { resetProvider, setProviderRegistered } from "@/utils/provider.utils";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";

import { Registry } from "./registry";

import type { IProvider } from "@/interfaces/provider.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { IDisposable } from "@/interfaces/disposable.interface";

export class Registration implements IRegistration {
  private readonly _registry = new Registry<IProvider<any>>();

  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): IDisposable {
    if (provider.registered) {
      throw new Error(`provider was already registered`);
    }

    const providers = this._registry.getAll(serviceIdentifier);
    for (const it of providers) {
      // must be same lifecycle
      if (it.lifecycle !== provider.lifecycle) {
        throw new Error(
          `all providers for the service identifier "${getServiceIdentifierName(
            serviceIdentifier
          )}" must have a consistent lifecycle`
        );
      }
      // must be same accessibility
      if (it.isPrivate !== provider.isPrivate) {
        throw new Error(
          `all providers for the service identifier "${getServiceIdentifierName(
            serviceIdentifier
          )}" must have a consistent accessibility`
        );
      }
    }

    this._registry.set(serviceIdentifier, provider);
    setProviderRegistered(provider, true);

    return {
      dispose: () => {
        this.unRegister(serviceIdentifier, provider);
      }
    };
  }

  unRegister<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider?: IProvider<T>
  ): void {
    const providers = this._registry.getAll(serviceIdentifier);

    let finallyProviders: IProvider<T>[] = [];

    if (provider) {
      finallyProviders = providers.filter((it) => it !== provider);
      resetProvider(provider);
    } else {
      providers.forEach((it) => {
        resetProvider(it);
      });
    }

    if (finallyProviders.length > 0) {
      this._registry.setAll(serviceIdentifier, finallyProviders);
    } else {
      this._registry.delete(serviceIdentifier);
    }
  }

  isRegistered<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: IsRegisteredOptions<T>
  ): boolean {
    const serviceIdentifierIsRegistered = this._registry.has(serviceIdentifier);

    if (!serviceIdentifierIsRegistered) return false;

    const { provider } = options || {};

    if (provider == void 0) {
      return serviceIdentifierIsRegistered;
    }

    const providers = this._registry.getAll(serviceIdentifier);
    const hasSameProvider = providers.some((it) => it == provider);

    return hasSameProvider;
  }

  getProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T> | null {
    return this._registry.get(serviceIdentifier);
  }

  getAllRegisteredServiceIdentifiers(): ServiceIdentifier<any>[] {
    return this._registry.keys();
  }

  getAllProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T>[] {
    return this._registry.getAll(serviceIdentifier);
  }
}
