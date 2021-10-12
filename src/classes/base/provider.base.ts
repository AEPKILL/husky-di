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

  protected _instance: T | undefined;
  private _root: this;

  get root(): this {
    return this._root;
  }

  get instance(): T | undefined {
    return this._instance;
  }

  constructor(options: ProviderOptions) {
    const { lifecycle = LifecycleEnum.transient } = options;

    this._root = this;
    this.lifecycle = lifecycle;
  }

  abstract resolve(container: IContainer, resolveContext: ResolveContext): T;

  abstract clone(): this;

  equal(provider: this): boolean {
    return this.root === provider.root;
  }

  clearInstance() {
    this._instance = void 0;
  }

  setInstance(instance?: T) {
    this._instance = instance;
  }

  protected _setRealRoot(provider: this): this {
    provider._root = this._root;

    return provider;
  }
}
