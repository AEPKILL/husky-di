/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:20:39
 */

import { LifecycleEnum } from "../enums/lifecycle.enum";
import { ResolveContext } from "../types/resolve-context.type";
import { IContainer } from "./container.interface";
import { IDerivation } from "./derivation.interface";

export interface ProviderOptions {
  lifecycle?: LifecycleEnum;
  isPrivate?: boolean;
}

export interface IProvider<T>
  extends IDerivation,
    Readonly<Required<ProviderOptions>> {
  readonly instance: T | undefined;
  readonly resolved: boolean;
  readonly registered: boolean;

  resolve(container: IContainer, resolveContext: ResolveContext): T;
}
