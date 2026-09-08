/**
 * @overview Creates Remote Service Descriptors with readonly metadata snapshots.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";

import {
	type RemoteServiceDescriptor,
	type RemoteServiceDescriptorOptions,
	type RpcMethodDefinitions,
	remoteServiceDescriptorOptionsSchema,
} from "@/modules/peer/types/remote-service-descriptor.type";

/** Creates a frozen Descriptor with a detached allowlist snapshot. */
export function createRemoteServiceDescriptor<
	T,
	const Definitions extends RpcMethodDefinitions<T>,
>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: RemoteServiceDescriptorOptions<T, Definitions>,
): RemoteServiceDescriptor<T, Definitions> {
	const result = remoteServiceDescriptorOptionsSchema.safeParse(options);
	if (!result.success) {
		throw new TypeError(result.error.message, { cause: result.error });
	}
	return Object.freeze(
		Object.assign(Object.create(null), { serviceIdentifier, ...result.data }),
	) as RemoteServiceDescriptor<T, Definitions>;
}
