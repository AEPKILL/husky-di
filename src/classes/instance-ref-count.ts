/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-19 10:56:24
 */

type CreateInstanceFactory<T> = () => T;

export class InstanceRefCount<T> {
  private _instance?: T;
  private _refsCount: number;
  private _resolved: boolean;
  private _factory: CreateInstanceFactory<T>;

  get isRoot(): boolean {
    return this._refsCount === 0;
  }

  get refsCount() {
    return this._refsCount;
  }

  get resolved() {
    return this._resolved;
  }

  constructor(factory: CreateInstanceFactory<T>) {
    this._factory = factory;
    this._refsCount = 0;
    this._resolved = false;
  }

  getInstanceWithoutRef(instance?: T): T {
    if (!this._resolved) {
      if (instance === undefined) {
        this._instance = this._factory();
      } else {
        this._instance = instance;
      }
      this._resolved = true;
    }

    return this._instance as T;
  }

  getInstance(instance?: T): T {
    this._refsCount++;
    return this.getInstanceWithoutRef(instance);
  }

  reset(): void {
    this._refsCount = 0;
    this._resolved = false;
    this._instance = void 0;
  }

  releaseInstance(): void {
    this._refsCount--;

    if (this._refsCount < 0) {
      throw new Error(
        "instance has zero refs, don't call `releaseInstance` method."
      );
    }

    if (this._refsCount === 0) {
      this.reset();
    }
  }

  $internal_setInstance(instance: T) {
    this._instance = instance;
  }
}
