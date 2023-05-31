/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:17:24
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";

import type { IContainer } from "@/interfaces/container.interface";
import type {
  IProvider,
  ProviderOptions
} from "@/interfaces/provider.interface";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ResolveRecordManager } from "../resolve-record-manager";

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

  abstract resolve(
    container: IContainer,
    resolveContext: ResolveContext,
    resolveRecordManager: ResolveRecordManager
  ): T;
  abstract clone(): this;
}
