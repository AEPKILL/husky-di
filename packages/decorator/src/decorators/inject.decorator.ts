/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:08:27
 */

import type { ResolveOptions, ServiceIdentifier } from "@husky-di/core";
import { tagged } from "@/decorators/tagged.decorator";
import type { InjectionMetadata } from "@/types/injection-metadata.type";

export type InjectOptions<T> = Omit<InjectionMetadata<T>, "serviceIdentifier">;

export const inject = <T>(
	serviceIdentifier: ServiceIdentifier<T>,
	options?: InjectOptions<T>,
): any => {
	return tagged({ ...(options as ResolveOptions<T>), serviceIdentifier });
};
