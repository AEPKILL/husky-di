/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:20:39
 */

import type { ResolveRecordManager } from "@/classes/resolve-record-manager";
import type { LifecycleEnum } from "../enums/lifecycle.enum";
import type { ResolveContext } from "../types/resolve-context.type";
import type { IContainer } from "./container.interface";
import type { IDerivation } from "./derivation.interface";

export interface ProviderOptions {
  lifecycle?: LifecycleEnum;
  isPrivate?: boolean;
}

export interface ProviderResolveOptions {
  container: IContainer;
  resolveContext: ResolveContext;
  resolveRecordManager: ResolveRecordManager;
}

export interface IProvider<T>
  extends IDerivation,
    Readonly<Required<ProviderOptions>> {
  readonly instance: T | undefined;
  readonly resolved: boolean;
  readonly registered: boolean;

  resolve(options: ProviderResolveOptions): T;
}
