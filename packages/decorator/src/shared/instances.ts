/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-06 21:47:22
 */

import type { Constructor } from "@husky-di/core";
import type { InjectionMetadata } from "@/types/injection-metadata.type";

/**
 * this map is used to store the injection metadata of the class constructor params
 */
export const injectionMetadataMap = new (typeof WeakMap === "undefined"
	? Map
	: WeakMap)() as {
	get<T>(target: Constructor<T>): InjectionMetadata<T>[];
	has<T>(target: Constructor<T>): boolean;
	set<T>(target: Constructor<T>, metadata: InjectionMetadata<T>[]): void;
};
