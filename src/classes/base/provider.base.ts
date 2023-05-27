/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:17:24
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { IContainer } from "@/interfaces/container.interface";
import { IProvider, ProviderOptions } from "@/interfaces/provider.interface";
import { ResolveContext } from "@/types/resolve-context.type";

export abstract class ProviderBase<T> implements IProvider<T> {
  readonly lifecycle: LifecycleEnum;
  readonly instance: T | undefined;
  readonly resolved: boolean;
  readonly registered: boolean;
  readonly isPrivate: boolean;

  constructor(options: ProviderOptions) {
    const { lifecycle = LifecycleEnum.transient, isPrivate = false } = options;
    this.resolved = false;
    this.registered = false;
    this.isPrivate = isPrivate;
    this.lifecycle = lifecycle;
  }

  abstract resolve(container: IContainer, resolveContext: ResolveContext): T;
  abstract clone(): this;
}
