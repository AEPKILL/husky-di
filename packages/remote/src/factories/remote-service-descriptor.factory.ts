/**
 * @overview Creates opaque Remote Service Descriptors.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";

import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type {
	NonEmptyMethodDefinitions,
	RpcMethodDefinitions,
	ValidateMethodDefinitions,
} from "@/types/remote-service-descriptor.type";

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

const textEncoder = new TextEncoder();
const maximumIdentifierBytes = 256;
const cancelableMethodDefinition = Object.freeze({ cancelable: true });

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function validateWireIdentifier(
	value: unknown,
	label: string,
): asserts value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		textEncoder.encode(value).byteLength > maximumIdentifierBytes
	) {
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
	return (
		descriptor !== undefined &&
		"value" in descriptor &&
		descriptor.value === true
	);
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
		if (typeof key !== "string") {
			throw new TypeError("methods must contain only string-named methods.");
		}

		validateWireIdentifier(key, "method name");
		if (key === "then") {
			throw new TypeError(
				"then is reserved and cannot be exposed as an RPC method.",
			);
		}

		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (
			descriptor === undefined ||
			!descriptor.enumerable ||
			!("value" in descriptor) ||
			(descriptor.value !== true &&
				!isCancelableMethodDefinition(descriptor.value))
		) {
			throw new TypeError(
				"Each method definition must be true or exactly { cancelable: true }.",
			);
		}

		snapshot[key] =
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
