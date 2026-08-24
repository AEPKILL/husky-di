/**
 * @overview Validates and atomically installs mixed-member RPC exposure routes.
 * @author AEPKILL
 * @created 2026-08-24 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import { isObservable } from "rxjs";

import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import type { RpcMemberInteraction } from "@/types/remote-service-descriptor.type";
import type {
	RpcExposure,
	RpcExposureRegistry,
	RpcExposureRoute,
} from "@/types/rpc-exposure.type";
import {
	rpcCallableSchema,
	rpcObjectOrFunctionSchema,
} from "@/utils/rpc-schema.util";

function findMemberDescriptor(
	implementation: object,
	member: string,
): PropertyDescriptor {
	const visited = new Set<object>();
	let target: object | null = implementation;
	try {
		while (target !== null) {
			if (visited.has(target)) {
				throw new TypeError("Implementation prototype chain contains a cycle.");
			}
			visited.add(target);
			const descriptor = Object.getOwnPropertyDescriptor(target, member);
			if (descriptor !== undefined) {
				return descriptor;
			}
			target = Object.getPrototypeOf(target);
		}
	} catch (error) {
		if (error instanceof TypeError) {
			throw error;
		}
		throw new TypeError(
			`Could not inspect selected implementation member ${member}.`,
		);
	}

	throw new TypeError(`Selected implementation member ${member} is missing.`);
}

function prepareMethodRoute(
	implementation: object,
	member: string,
	interaction: Exclude<RpcMemberInteraction, { kind: "stream-property" }>,
	descriptor: PropertyDescriptor,
): RpcExposureRoute {
	// Method routes accept only callable data properties and capture their receiver.
	const methodDescriptorIsInvalid =
		!("value" in descriptor) ||
		!rpcCallableSchema.safeParse(descriptor.value).success;
	if (methodDescriptorIsInvalid) {
		throw new TypeError(
			`Selected implementation member ${member} must be a data function.`,
		);
	}
	const handler = descriptor.value as (...args: unknown[]) => unknown;
	return interaction.kind === "unary"
		? Object.freeze({
				kind: "unary" as const,
				implementation,
				handler,
				cancelable: interaction.cancelable,
			})
		: Object.freeze({
				kind: "stream-method" as const,
				implementation,
				handler,
			});
}

function prepareStreamPropertyRoute(
	implementation: object,
	member: string,
	descriptor: PropertyDescriptor,
): RpcExposureRoute {
	if ("value" in descriptor) {
		if (!isObservable(descriptor.value)) {
			throw new TypeError(
				`Selected implementation property ${member} must contain an Observable.`,
			);
		}
		return Object.freeze({
			kind: "stream-property" as const,
			sourceKind: "data" as const,
			source: descriptor.value,
		});
	}

	if (typeof descriptor.get !== "function" || descriptor.set !== undefined) {
		throw new TypeError(
			`Selected implementation property ${member} must be data or getter-only.`,
		);
	}
	return Object.freeze({
		kind: "stream-property" as const,
		sourceKind: "getter" as const,
		implementation,
		getter: descriptor.get,
	});
}

function prepareExposure(
	descriptor: unknown,
	implementation: unknown,
): RpcExposure {
	const data = getRemoteServiceDescriptorData(descriptor);
	if (!rpcObjectOrFunctionSchema.safeParse(implementation).success) {
		throw new TypeError("implementation must be an object.");
	}

	const objectImplementation = implementation as object;
	const members = new Map<string, RpcExposureRoute>();
	for (const [member, interaction] of Object.entries(data.members)) {
		const property = findMemberDescriptor(objectImplementation, member);
		members.set(
			member,
			interaction.kind === "stream-property"
				? prepareStreamPropertyRoute(objectImplementation, member, property)
				: prepareMethodRoute(
						objectImplementation,
						member,
						interaction,
						property,
					),
		);
	}

	return Object.freeze({ wireName: data.wireName, members });
}

function assertNameAvailable(
	wireName: string,
	registry: RpcExposureRegistry,
	conflictingRegistries: readonly RpcExposureRegistry[],
): void {
	// A wire name must be absent from both the target and every conflicting registry.
	const wireNameIsTaken =
		registry.has(wireName) ||
		conflictingRegistries.some((candidate) => candidate.has(wireName));
	if (wireNameIsTaken) {
		throw new TypeError(`RPC wire service ${wireName} is already exposed.`);
	}
}

/** Validates a full exposure and commits one registry entry. */
export function installRpcExposure(
	descriptor: unknown,
	implementation: unknown,
	registry: RpcExposureRegistry,
	conflictingRegistries: readonly RpcExposureRegistry[] = [],
): Cleanup {
	const data = getRemoteServiceDescriptorData(descriptor);
	assertNameAvailable(data.wireName, registry, conflictingRegistries);
	const exposure = prepareExposure(descriptor, implementation);
	assertNameAvailable(exposure.wireName, registry, conflictingRegistries);
	registry.set(exposure.wireName, exposure);

	let active = true;
	return () => {
		if (!active) {
			return;
		}
		active = false;
		try {
			if (registry.get(exposure.wireName) === exposure) {
				registry.delete(exposure.wireName);
			}
		} catch {
			// Cleanup is deliberately non-throwing even if platform intrinsics were patched.
		}
	};
}
