/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 13:42:38
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { IContainer } from "@/interfaces/container.interface";
import { IProvider } from "@/interfaces/provider.interface";
import { ResolveContext } from "@/types/resolve-context.type";
import { Writable } from "@/types/utils.type";

export function setProviderInstance<T>(provider: IProvider<T>, instance: T) {
  (provider as Writable<IProvider<T>>).instance = instance;
  (provider as Writable<IProvider<T>>).resolved = true;
}

export function setProviderRegistered<T>(
  provider: IProvider<T>,
  registered: boolean
) {
  (provider as Writable<IProvider<T>>).registered = registered;
}

export function resetProvider<T>(provider: IProvider<T>) {
  (provider as Writable<IProvider<T>>).instance = undefined;
  (provider as Writable<IProvider<T>>).resolved = false;
  (provider as Writable<IProvider<T>>).registered = false;
}

export function applyProviderResolve<T>(
  provider: IProvider<T>,
  container: IContainer,
  resolveContext: ResolveContext
): T {
  if (provider.resolved) {
    return provider.instance!;
  }

  const instance = provider.resolve(container, resolveContext);

  if (provider.lifecycle === LifecycleEnum.singleton) {
    setProviderInstance(provider, instance);
  }

  return instance;
}
