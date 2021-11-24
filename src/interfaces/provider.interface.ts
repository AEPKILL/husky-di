/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:20:39
 */

import { DerivationBase } from '../classes/base/derivation.base';
import { LifecycleEnum } from '../enums/lifecycle.enum';
import { ResolveContext } from '../types/resolve-context.type';
import { IContainer } from './container.interface';

export interface ProviderOptions {
  lifecycle?: LifecycleEnum;
  isPrivate?: boolean;
}

export interface IProvider<T> extends DerivationBase {
  readonly isPrivate: boolean;
  readonly lifecycle: LifecycleEnum;
  readonly instance: T | undefined;
  readonly resolved: boolean;

  resolve(container: IContainer, resolveContext: ResolveContext): T;
  setInstance(instance?: T): void;
  setWasResolved(): void;
}
