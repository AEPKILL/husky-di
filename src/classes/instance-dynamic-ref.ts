/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-26 11:23:17
 */

import { Ref } from "@/types/ref.type";

export class InstanceDynamicRef<T> implements Ref<T> {
  private _resolved: boolean = false;
  private readonly _createInstance: () => T;

  constructor(createInstance: () => T) {
    this._createInstance = createInstance;
  }

  get current() {
    this._resolved = true;
    return this._createInstance();
  }

  get resolved() {
    return this._resolved;
  }
}
