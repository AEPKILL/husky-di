/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 10:47:34
 */

import type { ResolveOptions, ServiceIdentifier } from "@husky-di/core";

export type InjectionMetadata<T> = ResolveOptions<T> & {
	serviceIdentifier: ServiceIdentifier<T>;
};
