/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-06 22:47:46 10:47:34
 */

import type { ResolveHelperOptions, ServiceIdentifier } from "@husky-di/core";

export type InjectionMetadata<T> = ResolveHelperOptions<T> & {
	serviceIdentifier: ServiceIdentifier<T>;
};
