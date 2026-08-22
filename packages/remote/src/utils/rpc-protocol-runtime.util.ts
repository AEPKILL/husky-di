/**
 * @overview Constructs and validates owner-scoped custom Protocol runtimes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "@/utils/rpc-application-value.util";
import {
	rpcCallableSchema,
	rpcNonNullObjectSchema,
} from "@/utils/rpc-schema.util";

interface ConstructionGuard {
	active: boolean;
	violated: boolean;
}

export interface RpcProtocolConnectorHostPorts {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface RpcProtocolAcceptorHostPorts {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
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
	reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined,
	fault: (reason: RpcProtocolFaultReason, error: Error) => void,
): IRpcProtocolHost {
	return {
		policy,
		reserveRetainedBytes(
			bytes: number,
		): IRpcRetainedBytesReservation | undefined {
			if (guard.active) {
				return constructionViolation(guard);
			}
			return reserveRetainedBytes(bytes);
		},
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
					RpcCloseReasonEnum.protocolFault,
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
	if (!rpcNonNullObjectSchema.safeParse(value).success) {
		return false;
	}
	return rpcCallableSchema.safeParse(Reflect.get(value as object, key)).success;
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
	if (!isRuntimeMember(value, roleMember)) {
		throw new TypeError("protocol must implement both role factories.");
	}
}

function wrapProtocolConstruction<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		throw createRpcException(
			RpcExceptionCodeEnum.protocol,
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
			...createHostBase(policy, guard, ports.reserveRetainedBytes, ports.fault),
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
			...createHostBase(policy, guard, ports.reserveRetainedBytes, ports.fault),
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
