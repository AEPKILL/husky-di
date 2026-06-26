/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 10:47:34
 */

import type { ResolveHelperOptions, ServiceIdentifier } from "@husky-di/core";

export type InjectionMetadata<T> = ResolveHelperOptions<T> & {
	serviceIdentifier: ServiceIdentifier<T>;
};
