/**
 * @overview Creates opaque Remote Service Descriptors.
 * @author AEPKILL
 * @created 2026-09-08 22:00:49
 */

import type { ServiceIdentifier } from "@husky-di/core";

import {
	type RemoteServiceDescriptor,
	type RemoteServiceDescriptorOptions,
	type RemoteServiceDescriptorOptionsSnapshot,
	type RpcMemberDefinitions,
	remoteServiceDescriptorOptionsSchema,
} from "@/modules/peer/types/remote-service-descriptor.type";

export interface RemoteServiceDescriptorData {
	readonly serviceIdentifier: ServiceIdentifier<unknown>;
	readonly wireName: RemoteServiceDescriptorOptionsSnapshot["wireName"];
	readonly members: RemoteServiceDescriptorOptionsSnapshot["members"];
}

/** Creates an opaque Descriptor and retains a detached allowlist snapshot. */
export function createRemoteServiceDescriptor<
	T,
	const Definitions extends RpcMemberDefinitions<T>,
>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: RemoteServiceDescriptorOptions<T, Definitions>,
): RemoteServiceDescriptor<T, Definitions> {
	const optionsResult = remoteServiceDescriptorOptionsSchema.safeParse(options);
	if (!optionsResult.success) {
		throw new TypeError(optionsResult.error.message, {
			cause: optionsResult.error,
		});
	}
	const parsedOptions = optionsResult.data;
	const descriptor = Object.freeze(
		Object.create(null),
	) as RemoteServiceDescriptor<T, Definitions>;

	remoteServiceDescriptorData.set(
		descriptor,
		Object.freeze({
			serviceIdentifier: serviceIdentifier as ServiceIdentifier<unknown>,
			wireName: parsedOptions.wireName,
			members: parsedOptions.members,
		}),
	);

	return descriptor;
}

/** Reads package-private metadata from a genuine Descriptor. */
export function getRemoteServiceDescriptorData(
	descriptor: unknown,
): RemoteServiceDescriptorData {
	if (typeof descriptor !== "object" || descriptor === null) {
		throw new TypeError("descriptor must be created by this package instance.");
	}

	const data = remoteServiceDescriptorData.get(descriptor);
	if (data === undefined) {
		throw new TypeError("descriptor must be created by this package instance.");
	}
	return data;
}

const remoteServiceDescriptorData = new WeakMap<
	object,
	RemoteServiceDescriptorData
>();
