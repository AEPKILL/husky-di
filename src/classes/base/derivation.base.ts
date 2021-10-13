/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-13 19:17:01
 */

export abstract class DerivationBase {
  private _root: this;

  get root(): this {
    return this._root;
  }

  constructor() {
    this._root = this;
  }

  derivation(): this {
    const instance = this.clone();
    instance._root = this._root;
    return instance;
  }

  equal(instance: DerivationBase): boolean {
    return instance.root === this.root;
  }

  abstract clone(): this;
}
