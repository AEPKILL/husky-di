/**
 * @overview Creates opaque mixed-member Remote Service Descriptors.
 * @author AEPKILL
 * @created 2026-08-24 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";

import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type {
	NonEmptyMemberDefinitions,
	RemoteServiceDescriptorData,
	RpcMemberDefinitions,
	RpcMemberInteraction,
	ValidateMemberDefinitions,
} from "@/types/remote-service-descriptor.type";
import { rpcWireIdentifierSchema } from "@/utils/rpc-schema.util";

const remoteServiceDescriptorData = new WeakMap<
	object,
	RemoteServiceDescriptorData
>();

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	try {
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	} catch {
		return false;
	}
}

function ownKeys(value: object, label: string): readonly PropertyKey[] {
	try {
		return Reflect.ownKeys(value);
	} catch {
		throw new TypeError(`${label} could not be inspected.`);
	}
}

function readEnumerableDataProperty(
	record: object,
	key: PropertyKey,
	label: string,
): unknown {
	let property: PropertyDescriptor | undefined;
	try {
		property = Object.getOwnPropertyDescriptor(record, key);
	} catch {
		throw new TypeError(`${label} could not be inspected.`);
	}
	if (property === undefined) {
		throw new TypeError(`${label} must be an own enumerable data property.`);
	}
	if (!property.enumerable) {
		throw new TypeError(`${label} must be an own enumerable data property.`);
	}
	// Snapshotting must never execute an accessor.
	if (!("value" in property)) {
		throw new TypeError(`${label} must be an own enumerable data property.`);
	}
	return property.value;
}

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

function snapshotMemberDefinition(value: unknown): RpcMemberInteraction {
	if (!isPlainRecord(value)) {
		throw new TypeError("member definition must be a plain record.");
	}

	const keys = ownKeys(value, "member definition");
	const kind = readEnumerableDataProperty(value, "kind", "kind");
	if (kind === "unary") {
		if (keys.length === 1 && keys[0] === "kind") {
			return Object.freeze({ kind, cancelable: false });
		}
		const cancelable = readEnumerableDataProperty(
			value,
			"cancelable",
			"cancelable",
		);
		// The cancelable form has no extension fields or alternate boolean value.
		const keysAreExact =
			keys.length === 2 && keys.includes("kind") && keys.includes("cancelable");
		if (!keysAreExact || cancelable !== true) {
			throw new TypeError(
				"cancelable unary definition must be exactly { kind: 'unary', cancelable: true }.",
			);
		}
		return Object.freeze({ kind, cancelable: true });
	}

	// A stream definition is exactly one recognized kind field.
	const streamDefinitionIsInvalid =
		(kind !== "stream-method" && kind !== "stream-property") ||
		keys.length !== 1 ||
		keys[0] !== "kind";
	if (streamDefinitionIsInvalid) {
		throw new TypeError("stream definition must contain only its valid kind.");
	}
	return Object.freeze({ kind });
}

function snapshotMembers(
	value: unknown,
): RemoteServiceDescriptorData["members"] {
	if (!isPlainRecord(value)) {
		throw new TypeError("members must be a plain record.");
	}

	const keys = ownKeys(value, "members");
	if (keys.length === 0) {
		throw new TypeError("members must select at least one member.");
	}

	const snapshot = Object.create(null) as Record<string, RpcMemberInteraction>;
	for (const key of keys) {
		validateWireIdentifier(key, "member name");
		if (key === "then") {
			throw new TypeError("then is reserved and cannot be exposed.");
		}
		const definition = readEnumerableDataProperty(value, key, `member ${key}`);
		const interaction = snapshotMemberDefinition(definition);
		if (interaction.kind === "stream-property" && !key.endsWith("$")) {
			throw new TypeError("stream property names must end with $.");
		}
		snapshot[key] = interaction;
	}
	return Object.freeze(snapshot);
}

function snapshotOptions(options: unknown): {
	readonly wireName: string;
	readonly members: RemoteServiceDescriptorData["members"];
} {
	if (!isPlainRecord(options)) {
		throw new TypeError("options must be a plain record.");
	}
	const keys = ownKeys(options, "options");
	// The public options record has one closed, accessor-free shape.
	const keysAreExact =
		keys.length === 2 && keys.includes("wireName") && keys.includes("members");
	if (!keysAreExact) {
		throw new TypeError("options must contain exactly wireName and members.");
	}
	const wireName = readEnumerableDataProperty(options, "wireName", "wireName");
	validateWireIdentifier(wireName, "wireName");
	const members = snapshotMembers(
		readEnumerableDataProperty(options, "members", "members"),
	);
	return { wireName, members };
}

/** Creates an opaque Descriptor and retains a detached mixed-member snapshot. */
export function createRemoteServiceDescriptor<
	T,
	const Members extends RpcMemberDefinitions<T>,
>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: {
		readonly wireName: string;
		readonly members: Members &
			ValidateMemberDefinitions<T, Members> &
			NonEmptyMemberDefinitions<Members>;
	},
): IRemoteServiceDescriptor<T, Members> {
	const { wireName, members } = snapshotOptions(options);
	const descriptor = Object.freeze(
		Object.create(null),
	) as IRemoteServiceDescriptor<T, Members>;

	remoteServiceDescriptorData.set(
		descriptor,
		Object.freeze({
			serviceIdentifier: serviceIdentifier as ServiceIdentifier<unknown>,
			wireName,
			members,
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
