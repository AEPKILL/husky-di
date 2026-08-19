/**
 * @overview Validates and atomically installs RPC exposure routes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";

import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";

export interface RpcHandlerRoute {
	readonly implementation: object;
	readonly handler: (...args: unknown[]) => unknown;
	readonly cancelable: boolean;
}

export interface RpcExposure {
	readonly wireName: string;
	readonly methods: ReadonlyMap<string, RpcHandlerRoute>;
}

export type RpcExposureRegistry = Map<string, RpcExposure>;

function findHandler(
	implementation: object,
	method: string,
): (...args: unknown[]) => unknown {
	const visited = new Set<object>();
	let target: object | null = implementation;
	try {
		while (target !== null) {
			if (visited.has(target)) {
				throw new TypeError("Implementation prototype chain contains a cycle.");
			}
			visited.add(target);
			const descriptor = Object.getOwnPropertyDescriptor(target, method);
			if (descriptor !== undefined) {
				if (
					!("value" in descriptor) ||
					typeof descriptor.value !== "function"
				) {
					throw new TypeError(
						`Selected implementation member ${method} must be a data function.`,
					);
				}
				return descriptor.value as (...args: unknown[]) => unknown;
			}
			target = Object.getPrototypeOf(target);
		}
	} catch (error) {
		if (error instanceof TypeError) {
			throw error;
		}
		throw new TypeError(
			`Could not inspect selected implementation member ${method}.`,
		);
	}

	throw new TypeError(`Selected implementation member ${method} is missing.`);
}

function prepareExposure(
	descriptor: unknown,
	implementation: unknown,
): RpcExposure {
	const data = getRemoteServiceDescriptorData(descriptor);
	if (
		(typeof implementation !== "object" &&
			typeof implementation !== "function") ||
		implementation === null
	) {
		throw new TypeError("implementation must be an object.");
	}

	const objectImplementation = implementation as object;
	const methods = new Map<string, RpcHandlerRoute>();
	for (const method of Object.keys(data.methods)) {
		methods.set(
			method,
			Object.freeze({
				implementation: objectImplementation,
				handler: findHandler(objectImplementation, method),
				cancelable: data.methods[method] !== true,
			}),
		);
	}

	return Object.freeze({ wireName: data.wireName, methods });
}

function assertNameAvailable(
	wireName: string,
	registry: RpcExposureRegistry,
	conflictingRegistries: readonly RpcExposureRegistry[],
): void {
	if (
		registry.has(wireName) ||
		conflictingRegistries.some((candidate) => candidate.has(wireName))
	) {
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
		if (active && registry.get(exposure.wireName) === exposure) {
			registry.delete(exposure.wireName);
		}
		active = false;
	};
}
