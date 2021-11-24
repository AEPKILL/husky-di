/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 10:14:07
 */

import { IUsing } from '../../interfaces/using.interface';

export abstract class UsingBase<T> implements IUsing<T> {
  protected _current?: T;
  protected _resolved: boolean = false;
  protected _disposed: boolean = false;

  get resolved() {
    return this._resolved;
  }

  get disposed() {
    return this._disposed;
  }

  get current() {
    return this._current;
  }

  abstract get(): T;
  abstract dispose(): void;
}
