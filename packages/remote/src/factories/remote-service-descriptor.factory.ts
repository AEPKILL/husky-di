/**
 * @overview Creates opaque Remote Service Descriptors.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import { z } from "zod";

import type { IRemoteServiceDescriptor } from "@/interfaces/peer/remote-service-descriptor.interface";
import type {
	NonEmptyMethodDefinitions,
	RpcMethodDefinitions,
	ValidateMethodDefinitions,
} from "@/types/remote-service-descriptor.type";
import { rpcWireIdentifierSchema } from "@/utils/protocol/rpc-wire-identifier-schema.util";
import { isPlainRecord, isString } from "@/utils/type-guard.util";

const rpcCancelableMethodDefinitionSchema = z.strictObject({
	cancelable: z.literal(true),
});

export interface RemoteServiceDescriptorData {
	readonly serviceIdentifier: ServiceIdentifier<unknown>;
	readonly wireName: string;
	readonly methods: Readonly<
		Record<string, true | { readonly cancelable: true }>
	>;
}

const remoteServiceDescriptorData = new WeakMap<
	object,
	RemoteServiceDescriptorData
>();

const cancelableMethodDefinition = Object.freeze({ cancelable: true });

function validateWireIdentifier(
	value: unknown,
	label: string,
): asserts value is string {
	if (!rpcWireIdentifierSchema.safeParse(value).success) {
		throw new TypeError(
			`${label} must be a non-empty string of at most 256 UTF-8 bytes.`,
		);
	}
}

function isCancelableMethodDefinition(value: unknown): boolean {
	if (!isPlainRecord(value)) {
		return false;
	}

	const keys = Reflect.ownKeys(value);
	if (keys.length !== 1 || keys[0] !== "cancelable") {
		return false;
	}

	const descriptor = Object.getOwnPropertyDescriptor(value, "cancelable");
	if (descriptor === undefined || !("value" in descriptor)) {
		return false;
	}

	const snapshot = { cancelable: descriptor.value };
	return rpcCancelableMethodDefinitionSchema.safeParse(snapshot).success;
}

function snapshotMethods(
	value: unknown,
): RemoteServiceDescriptorData["methods"] {
	if (!isPlainRecord(value)) {
		throw new TypeError("methods must be a plain record.");
	}

	const keys = Reflect.ownKeys(value);
	if (keys.length === 0) {
		throw new TypeError("methods must select at least one method.");
	}

	const snapshot = Object.create(null) as Record<
		string,
		true | { readonly cancelable: true }
	>;
	for (const key of keys) {
		if (!isString(key)) {
			throw new TypeError("methods must contain only string-named methods.");
		}
		const methodName = key;

		validateWireIdentifier(methodName, "method name");
		if (methodName === "then") {
			throw new TypeError(
				"then is reserved and cannot be exposed as an RPC method.",
			);
		}

		const descriptor = Object.getOwnPropertyDescriptor(value, methodName);
		// A method definition must be an enumerable data property in an allowed shape.
		const methodDefinitionIsInvalid =
			descriptor === undefined ||
			!descriptor.enumerable ||
			!("value" in descriptor) ||
			(descriptor.value !== true &&
				!isCancelableMethodDefinition(descriptor.value));
		if (methodDefinitionIsInvalid) {
			throw new TypeError(
				"Each method definition must be true or exactly { cancelable: true }.",
			);
		}

		snapshot[methodName] =
			descriptor.value === true ? true : cancelableMethodDefinition;
	}

	return Object.freeze(snapshot);
}

/** Creates an opaque Descriptor and retains a detached allowlist snapshot. */
export function createRemoteServiceDescriptor<
	T,
	const Definitions extends RpcMethodDefinitions<T>,
>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: {
		readonly wireName: string;
		readonly methods: Definitions &
			ValidateMethodDefinitions<T, Definitions> &
			NonEmptyMethodDefinitions<Definitions>;
	},
): IRemoteServiceDescriptor<T, Definitions> {
	validateWireIdentifier(options.wireName, "wireName");
	const methods = snapshotMethods(options.methods);
	const descriptor = Object.freeze(
		Object.create(null),
	) as IRemoteServiceDescriptor<T, Definitions>;

	remoteServiceDescriptorData.set(
		descriptor,
		Object.freeze({
			serviceIdentifier: serviceIdentifier as ServiceIdentifier<unknown>,
			wireName: options.wireName,
			methods,
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
