/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-26 11:23:17
 */

import type { Ref } from "@/types/ref.type";

export class InstanceDynamicRef<T> implements Ref<T> {
  private _resolved = false;
  private readonly _createInstance: () => T;

  constructor(createInstance: () => T) {
    this._createInstance = createInstance;
  }

  get current(): T {
    this._resolved = true;
    return this._createInstance();
  }

  get resolved(): boolean {
    return this._resolved;
  }
}
