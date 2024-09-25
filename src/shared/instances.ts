/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 11:06:40
 */

import { InstanceRefCount } from "@/classes/instance-ref-count";
import { ResolveRecordManager } from "@/classes/resolve-record-manager";

import type { Constructor } from "@/types/constructor.type";
import type { InjectionMetadata } from "@/types/injection-metadata.type";

/**
 * this map is used to store the injection metadata of the class constructor params
 */
const InjectionMetadataMap = typeof WeakMap === "undefined" ? Map : WeakMap;
export const injectionMetadataMap = new InjectionMetadataMap() as {
  get<T>(target: Constructor<T>): InjectionMetadata<T>[];
  has<T>(target: Constructor<T>): boolean;
  set<T>(target: Constructor<T>, metadata: InjectionMetadata<T>[]): void;
};

export const resolveRecordManagerRef = new InstanceRefCount(
  "ResolveRecordManager",
  () => new ResolveRecordManager()
);
