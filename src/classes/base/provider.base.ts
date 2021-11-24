/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:17:24
 */

import { LifecycleEnum } from '../../enums/lifecycle.enum';
import { IContainer } from '../../interfaces/container.interface';
import {
  IProvider,
  ProviderOptions,
} from '../../interfaces/provider.interface';
import { ResolveContext } from '../../types/resolve-context.type';
import { DerivationBase } from './derivation.base';

export abstract class ProviderBase<T> extends DerivationBase
  implements IProvider<T> {
  readonly lifecycle: LifecycleEnum;

  private _resolved: boolean;
  private _instance: T | undefined;
  private _isPrivate: boolean;

  get resolved(): boolean {
    return this._resolved;
  }

  get isPrivate() {
    return this._isPrivate;
  }

  get instance(): T | undefined {
    return this._instance;
  }

  constructor(options: ProviderOptions) {
    super();
    const { lifecycle = LifecycleEnum.transient, isPrivate = false } = options;

    this._resolved = false;
    this._isPrivate = isPrivate;
    this.lifecycle = lifecycle;
  }

  abstract resolve(container: IContainer, resolveContext: ResolveContext): T;

  abstract clone(): this;

  setInstance(instance?: T) {
    this._instance = instance;
  }

  setWasResolved(): void {
    this._resolved = true;
  }
}
