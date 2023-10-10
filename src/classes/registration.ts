/**
 * @overview
 * @author AEPKILL
 * @created 2023-10-10 11:01:57
 */

import type { IRegistration } from "@/interfaces/registration.interface";
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
        const providers = this._registry.getAll(serviceIdentifier);
        this._registry.setAll(
          serviceIdentifier,
          providers.filter((it) => it !== provider)
        );
        resetProvider(provider);
      }
    };
  }

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
    return this._registry.has(serviceIdentifier);
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
