/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 13:42:38
 */

import type { IProvider } from "@/interfaces/provider.interface";
import type { Writable } from "@/types/utils.type";

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
