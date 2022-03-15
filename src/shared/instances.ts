/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-23 10:09:14
 */

import { InstanceRefCount } from '../classes/instance-ref-count';
import { ResolveRecordManager } from '../classes/resolve-record-manager';
import { Constructor } from '../types/constructor.type';

export const resolveRecordManagerRef = new InstanceRefCount(
  () => new ResolveRecordManager()
);

export const targetInjectionMetadata = new Map() as {
  has<T>(target: Constructor<T>): boolean;
  get<T>(
    target: Constructor<T>
  ): Array<HuskyDi.InjectionMetadata<T>> | undefined;
  set<T>(
    target: Constructor<T>,
    injectionMetadata: Array<HuskyDi.InjectionMetadata<T>>
  ): void;
};
