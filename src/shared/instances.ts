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

export const injectionMetadataMap = new Map() as {
  get<T>(target: Constructor<T>): HuskyDi.InjectionMetadata<T>[];
  has<T>(target: Constructor<T>): boolean;
  set<T>(
    target: Constructor<T>,
    metadata: HuskyDi.InjectionMetadata<T>[]
  ): void;
};
