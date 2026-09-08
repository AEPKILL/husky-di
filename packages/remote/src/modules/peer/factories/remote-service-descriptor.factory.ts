/**
 * @overview Creates opaque Remote Service Descriptors and retains their private metadata.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";

import {
	type RemoteServiceDescriptor,
	type RemoteServiceDescriptorOptions,
	type RemoteServiceDescriptorOptionsSnapshot,
	type RpcMethodDefinitions,
	remoteServiceDescriptorOptionsSchema,
} from "@/modules/peer/types/remote-service-descriptor.type";
import { isNonNullObject } from "@/shared/utils/type.util";

/** Creates an opaque Descriptor and retains a detached allowlist snapshot. */
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
	const descriptor = Object.freeze(
		Object.create(null),
	) as RemoteServiceDescriptor<T, Definitions>;
	remoteServiceDescriptorData.set(
		descriptor,
		Object.freeze({
			serviceIdentifier: serviceIdentifier as ServiceIdentifier<unknown>,
			wireName: result.data.wireName,
			methods: result.data.methods,
		}),
	);
	return descriptor;
}

/** Reads private metadata only for Descriptors created by this module instance. */
export function getRemoteServiceDescriptorData(
	descriptor: unknown,
): RemoteServiceDescriptorData {
	if (!isNonNullObject(descriptor)) {
		throw new TypeError("descriptor must be created by this package instance.");
	}
	const data = remoteServiceDescriptorData.get(descriptor);
	if (data === undefined) {
		throw new TypeError("descriptor must be created by this package instance.");
	}
	return data;
}

type RemoteServiceDescriptorData = {
	readonly serviceIdentifier: ServiceIdentifier<unknown>;
	readonly wireName: RemoteServiceDescriptorOptionsSnapshot["wireName"];
	readonly methods: RemoteServiceDescriptorOptionsSnapshot["methods"];
};

const remoteServiceDescriptorData = new WeakMap<
	object,
	RemoteServiceDescriptorData
>();
