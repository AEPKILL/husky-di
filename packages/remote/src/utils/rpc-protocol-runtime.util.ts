/**
 * @overview Constructs and validates owner-scoped custom Protocol runtimes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createRpcError } from "@/exceptions/rpc-error.exception";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
} from "@/interfaces/rpc-protocol.interface";
import { getDefaultRpcProtocol } from "@/protocols/default/default-rpc-protocol.impl";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "@/utils/rpc-application-value.util";

interface ConstructionGuard {
	active: boolean;
	violated: boolean;
}

export interface RpcProtocolConnectorHostPorts {
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface RpcProtocolAcceptorHostPorts {
	admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export function resolveRpcProtocol(
	protocol: IRpcProtocol | undefined,
): IRpcProtocol {
	return protocol ?? getDefaultRpcProtocol();
}

function constructionViolation(guard: ConstructionGuard): never {
	guard.violated = true;
	throw new TypeError(
		"Protocol host ports cannot be called during construction.",
	);
}

function createHostBase(
	policy: IRpcProtocolRuntimePolicy,
	guard: ConstructionGuard,
	fault: (reason: RpcProtocolFaultReason, error: Error) => void,
): {
	readonly policy: IRpcProtocolRuntimePolicy;
	normalizeApplicationValue(value: unknown): IRpcApplicationSnapshot;
	normalizeApplicationArguments(
		value: unknown,
	): IRpcApplicationArgumentsSnapshot;
	applicationValuesEqual(
		left: IRpcApplicationSnapshot,
		right: IRpcApplicationSnapshot,
	): boolean;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
} {
	return {
		policy,
		normalizeApplicationValue(value: unknown): IRpcApplicationSnapshot {
			if (guard.active) {
				return constructionViolation(guard);
			}
			return normalizeRpcApplicationValue(value);
		},
		normalizeApplicationArguments(
			value: unknown,
		): IRpcApplicationArgumentsSnapshot {
			if (guard.active) {
				return constructionViolation(guard);
			}
			return normalizeRpcApplicationArguments(value);
		},
		applicationValuesEqual(
			left: IRpcApplicationSnapshot,
			right: IRpcApplicationSnapshot,
		): boolean {
			if (guard.active) {
				return constructionViolation(guard);
			}
			try {
				return rpcApplicationValuesEqual(left, right);
			} catch (error) {
				fault(
					"protocol-fault",
					error instanceof Error
						? error
						: new Error("Protocol supplied an invalid Application snapshot."),
				);
				return false;
			}
		},
		fault(reason: RpcProtocolFaultReason, error: Error): void {
			if (guard.active) {
				constructionViolation(guard);
			}
			fault(reason, error);
		},
	};
}

function isRuntimeMember(value: unknown, key: string): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof Reflect.get(value, key) === "function"
	);
}

function validateRoleRuntime(
	value: unknown,
	roleMember: "bind" | "accept",
): void {
	for (const key of [roleMember, "shutdown", "close", "cleanup"]) {
		if (!isRuntimeMember(value, key)) {
			throw new TypeError(`Protocol runtime must provide ${key}().`);
		}
	}
}

function validateProtocol(
	value: unknown,
	roleMember: string,
): asserts value is IRpcProtocol {
	if (
		typeof value !== "object" ||
		value === null ||
		typeof Reflect.get(value, roleMember) !== "function"
	) {
		throw new TypeError("protocol must implement both role factories.");
	}
}

function wrapProtocolConstruction<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		throw createRpcError(
			"protocol",
			error instanceof Error
				? error
				: new Error("Protocol construction failed."),
		);
	}
}

export function createRpcProtocolConnectorRuntime(
	protocol: unknown,
	policy: IRpcProtocolRuntimePolicy,
	ports: RpcProtocolConnectorHostPorts,
): IRpcProtocolConnectorRuntime {
	return wrapProtocolConstruction(() => {
		validateProtocol(protocol, "createConnector");
		validateProtocol(protocol, "createAcceptor");
		const guard: ConstructionGuard = { active: true, violated: false };
		const host = Object.freeze<IRpcProtocolConnectorHost>({
			...createHostBase(policy, guard, ports.fault),
			attachSession(
				session: IRpcProtocolSession,
			): IRpcProtocolSessionHost | undefined {
				if (guard.active) {
					guard.violated = true;
					return undefined;
				}
				return ports.attachSession(session);
			},
		});
		const runtime = protocol.createConnector(host);
		guard.active = false;
		if (guard.violated) {
			throw new TypeError("Protocol mutated its host during construction.");
		}
		validateRoleRuntime(runtime, "bind");
		return runtime;
	});
}

export function createRpcProtocolAcceptorRuntime(
	protocol: unknown,
	policy: IRpcProtocolRuntimePolicy,
	ports: RpcProtocolAcceptorHostPorts,
): IRpcProtocolAcceptorRuntime {
	return wrapProtocolConstruction(() => {
		validateProtocol(protocol, "createConnector");
		validateProtocol(protocol, "createAcceptor");
		const guard: ConstructionGuard = { active: true, violated: false };
		const host = Object.freeze<IRpcProtocolAcceptorHost>({
			...createHostBase(policy, guard, ports.fault),
			admitSession(
				session: IRpcProtocolSession,
			): IRpcProtocolSessionHost | undefined {
				if (guard.active) {
					guard.violated = true;
					return undefined;
				}
				return ports.admitSession(session);
			},
		});
		const runtime = protocol.createAcceptor(host);
		guard.active = false;
		if (guard.violated) {
			throw new TypeError("Protocol mutated its host during construction.");
		}
		validateRoleRuntime(runtime, "accept");
		return runtime;
	});
}
