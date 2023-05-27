/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-26 11:23:17
 */

import { Ref } from "@/types/ref.type";

export class InstanceRef<T> implements Ref<T> {
  private _current: T | undefined;
  private _resolved: boolean = false;
  private readonly _createInstance: () => T;

  constructor(createInstance: () => T) {
    this._createInstance = createInstance;
  }

  get current() {
    if (!this._resolved) {
      this._current = this._createInstance();
      this._resolved = true;
    }

    return this._current!;
  }

  get resolved() {
    return this._resolved;
  }
}
