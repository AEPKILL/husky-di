/**
 * @overview Validates and atomically installs RPC exposure routes.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

import type { Cleanup } from "@husky-di/core";
import { isObservable, type Observable } from "rxjs";

import { getRemoteServiceDescriptorData } from "@/modules/peer/factories/remote-service-descriptor.factory";
import type { RpcMemberDefinition } from "@/modules/peer/types/remote-service-descriptor.type";
import type {
	RpcExposure,
	RpcHandlerRoute,
} from "@/modules/peer/types/rpc-exposure.type";
import { isCallable, isObjectOrFunction } from "@/shared/utils/type-guard.util";

/** Validates a full exposure and commits one registry entry. */
export function installRpcExposure(
	descriptor: unknown,
	implementation: unknown,
	hasConflict: (wireName: string) => boolean,
	commit: (exposure: RpcExposure) => Cleanup,
): Cleanup {
	const data = getRemoteServiceDescriptorData(descriptor);
	assertNameAvailable(data.wireName, hasConflict);
	const exposure = prepareExposure(descriptor, implementation);
	assertNameAvailable(exposure.wireName, hasConflict);
	return commit(exposure);
}

function findHandler(
	implementation: object,
	member: string,
): (...args: unknown[]) => unknown {
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
				// Exposed handlers must be callable data properties, never accessors.
				const handlerDescriptorIsInvalid =
					!("value" in descriptor) || !isCallable(descriptor.value);
				if (handlerDescriptorIsInvalid) {
					throw new TypeError(
						`Selected implementation member ${member} must be a data function.`,
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
			`Could not inspect selected implementation member ${member}.`,
		);
	}

	throw new TypeError(`Selected implementation member ${member} is missing.`);
}

function findObservable(
	implementation: object,
	member: string,
): Observable<unknown> {
	const visited = new Set<object>();
	let target: object | null = implementation;
	try {
		while (target !== null) {
			if (visited.has(target))
				throw new TypeError("Implementation prototype chain contains a cycle.");
			visited.add(target);
			const descriptor = Object.getOwnPropertyDescriptor(target, member);
			if (descriptor !== undefined) {
				if (!("value" in descriptor)) {
					throw new TypeError(
						`Selected implementation member ${member} must be a data Observable.`,
					);
				}
				if (!isObservable(descriptor.value)) {
					throw new TypeError(
						`Selected implementation member ${member} must be an Observable.`,
					);
				}
				return descriptor.value;
			}
			target = Object.getPrototypeOf(target);
		}
	} catch (error) {
		if (error instanceof TypeError) throw error;
		throw new TypeError(
			`Could not inspect selected implementation member ${member}.`,
		);
	}
	throw new TypeError(`Selected implementation member ${member} is missing.`);
}

function prepareExposure(
	descriptor: unknown,
	implementation: unknown,
): RpcExposure {
	const data = getRemoteServiceDescriptorData(descriptor);
	if (!isObjectOrFunction(implementation)) {
		throw new TypeError("implementation must be an object.");
	}

	const objectImplementation = implementation;
	const members = new Map<string, RpcHandlerRoute>();
	for (const member of Object.keys(data.members)) {
		const definition = data.members[member] as RpcMemberDefinition;
		if (definition.kind === "observable") {
			const observable = findObservable(objectImplementation, member);
			members.set(
				member,
				Object.freeze({
					implementation: objectImplementation,
					handler: () => observable,
					cancelable: false,
					kind: definition.kind,
					observable,
				}),
			);
			continue;
		}
		members.set(
			member,
			Object.freeze({
				implementation: objectImplementation,
				handler: findHandler(objectImplementation, member),
				cancelable:
					definition.kind === "function" && "cancelable" in definition,
				kind: definition.kind,
			}),
		);
	}

	return Object.freeze({ wireName: data.wireName, members });
}

function assertNameAvailable(
	wireName: string,
	hasConflict: (wireName: string) => boolean,
): void {
	if (hasConflict(wireName)) {
		throw new TypeError(`RPC wire service ${wireName} is already exposed.`);
	}
}
