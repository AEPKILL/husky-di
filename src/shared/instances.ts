/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 11:06:40
 */

import { InstanceRefCount } from "@/classes/instance-ref-count";
import { ResolveRecordManager } from "@/classes/resolve-record-manager";
import { Constructor } from "@/types/constructor.type";
import { InjectionMetadata } from "@/types/injection-metadata.type";

/**
 * this map is used to store the injection metadata of the class constructor params
 */
export const injectionMetadataMap = new Map() as {
  get<T>(target: Constructor<T>): InjectionMetadata<T>[];
  has<T>(target: Constructor<T>): boolean;
  set<T>(target: Constructor<T>, metadata: InjectionMetadata<T>[]): void;
};

export const resolveRecordManagerRef = new InstanceRefCount(
  () => new ResolveRecordManager()
);
