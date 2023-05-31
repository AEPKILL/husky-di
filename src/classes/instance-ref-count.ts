/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 16:52:50
 */

type CreateInstanceFactory<T> = () => T;

export class InstanceRefCount<T> {
  private _instance?: T;
  private _count: number;
  private _resolved: boolean;
  private _factory: CreateInstanceFactory<T>;

  get isNoRefs(): boolean {
    return this._count === 0;
  }

  get instance(): T | undefined {
    return this._instance;
  }

  constructor(factory: CreateInstanceFactory<T>) {
    this._factory = factory;
    this._count = 0;
    this._resolved = false;
  }

  useInstance(instance?: T): T {
    if (!this._resolved) {
      if (instance === undefined) {
        this._instance = this._factory();
      } else {
        this._instance = instance;
      }
      this._resolved = true;
    }

    this._count++;

    return this._instance!;
  }

  releaseInstance(): void {
    this._count--;

    if (this._count < 0) {
      this._count = 0;
      console.warn("no more references to release");
    }

    if (this.isNoRefs) {
      this.reset();
    }
  }

  reset(): void {
    this._count = 0;
    this._resolved = false;
    this._instance = void 0;
  }

  $internal_setInstance(instance: T): void {
    this._resolved = true;
    this._instance = instance;
  }
}
