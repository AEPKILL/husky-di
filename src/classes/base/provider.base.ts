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

export abstract class ProviderBase<T> implements IProvider<T> {
  readonly lifecycle: LifecycleEnum;

  private _root: this;
  private _resolved: boolean;
  private _instance: T | undefined;

  get root(): this {
    return this._root;
  }

  get resolved(): boolean {
    return this._resolved;
  }

  get instance(): T | undefined {
    return this._instance;
  }

  constructor(options: ProviderOptions) {
    const { lifecycle = LifecycleEnum.transient } = options;

    this._root = this;
    this._resolved = false;
    this.lifecycle = lifecycle;
  }

  abstract resolve(container: IContainer, resolveContext: ResolveContext): T;

  abstract clone(): this;

  equal(provider: this): boolean {
    return this.root === provider.root;
  }

  setInstance(instance?: T) {
    this._instance = instance;
  }

  setWasResolved(): void {
    this._resolved = true;
  }

  protected _setRealRoot(provider: this): this {
    provider._root = this._root;

    return provider;
  }
}
