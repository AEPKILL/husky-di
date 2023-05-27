/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:33:39
 */

import { ServiceIdentifier } from "@/types/service-identifier.type";

export class Registry<T> {
  protected _registryMap = new Map<ServiceIdentifier<any>, T[]>();

  public keys(): ServiceIdentifier<any>[] {
    return Array.from(this._registryMap.keys());
  }

  public entries(): IterableIterator<[ServiceIdentifier<any>, T[]]> {
    return this._registryMap.entries();
  }

  public getAll(key: ServiceIdentifier<any>): T[] {
    this.ensure(key);
    return this._registryMap.get(key)!;
  }

  public get(key: ServiceIdentifier<any>): T | null {
    this.ensure(key);
    const value = this._registryMap.get(key)!;
    return value[value.length - 1] || null;
  }

  public set(key: ServiceIdentifier<any>, value: T): void {
    this.ensure(key);
    this._registryMap.get(key)!.push(value);
  }

  public setAll(key: ServiceIdentifier<any>, value: T[]): void {
    this._registryMap.set(key, value);
  }

  public has(key: ServiceIdentifier<any>): boolean {
    this.ensure(key);
    return this._registryMap.get(key)!.length > 0;
  }

  public clear(): void {
    this._registryMap.clear();
  }

  private ensure(key: ServiceIdentifier<any>): void {
    if (!this._registryMap.has(key)) {
      this._registryMap.set(key, []);
    }
  }
}
