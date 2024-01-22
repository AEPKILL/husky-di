/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:33:39
 */

import type { ServiceIdentifier } from "@/types/service-identifier.type";

export class Registry<T> {
  protected _registryMap = new Map<ServiceIdentifier<any>, T[]>();

  public keys(): ServiceIdentifier<any>[] {
    return Array.from(this._registryMap.keys());
  }

  public getAll(key: ServiceIdentifier<any>): T[] {
    return this._registryMap.get(key) || [];
  }

  public get(key: ServiceIdentifier<any>): T | null {
    const value = this.getAll(key);
    return value[value.length - 1] || null;
  }

  public set(key: ServiceIdentifier<any>, value: T): void {
    this._registryMap.set(key, [...this.getAll(key), value]);
  }

  public setAll(key: ServiceIdentifier<any>, value: T[]): void {
    this._registryMap.set(key, value);
  }

  public delete(key: ServiceIdentifier<any>): void {
    this._registryMap.delete(key);
  }

  public has(key: ServiceIdentifier<any>): boolean {
    return this.getAll(key).length > 0;
  }

  public clear(): void {
    this._registryMap.clear();
  }
}
