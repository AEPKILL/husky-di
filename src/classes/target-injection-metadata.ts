/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-11 16:18:09
 */

import { Constructor } from '../types/constructor.type';

export class TargetInjectionMetadata {
  private _injectionMetadataMap: Map<
    Constructor<any>,
    Array<HuskyDi.InjectionMetadata<any>>
  > = new Map();

  has<T>(target: Constructor<T>): boolean {
    return this._injectionMetadataMap.has(target);
  }

  get<T>(
    target: Constructor<T>
  ): undefined | Array<HuskyDi.InjectionMetadata<T>> {
    return this._injectionMetadataMap.get(target);
  }

  set<T>(
    target: Constructor<T>,
    injectionMetadata: Array<HuskyDi.InjectionMetadata<T>>
  ) {
    this._injectionMetadataMap.set(target, injectionMetadata);
  }
}
