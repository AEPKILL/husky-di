/**
 * @overview Constructs and validates owner-scoped custom Protocol roles.
 * @author AEPKILL
 * @created 2026-08-31 00:00:00
 */

import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
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
import { isCallable, isNonNullObject } from "@/utils/type-guard.util";

export function createRpcProtocolConnectorForOwner(
	protocolFactory: unknown,
	policy: IRpcProtocolRuntimePolicy,
	ports: RpcProtocolConnectorHostPorts,
): IRpcProtocolConnector {
	return wrapProtocolConstruction(() => {
		validateProtocolFactory(protocolFactory);
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
		const protocol = protocolFactory(host);
		guard.active = false;
		if (guard.violated) {
			throw new TypeError("Protocol mutated its host during construction.");
		}
		validateProtocolRole(protocol, "bind");
		return protocol as IRpcProtocolConnector;
	});
}

export function createRpcProtocolAcceptorForOwner(
	protocolFactory: unknown,
	policy: IRpcProtocolRuntimePolicy,
	ports: RpcProtocolAcceptorHostPorts,
): IRpcProtocolAcceptor {
	return wrapProtocolConstruction(() => {
		validateProtocolFactory(protocolFactory);
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
		const protocol = protocolFactory(host);
		guard.active = false;
		if (guard.violated) {
			throw new TypeError("Protocol mutated its host during construction.");
		}
		validateProtocolRole(protocol, "accept");
		return protocol as IRpcProtocolAcceptor;
	});
}

type RpcProtocolConnectorHostPorts = Readonly<{
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}>;

type RpcProtocolAcceptorHostPorts = Readonly<{
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}>;

interface ConstructionGuard {
	active: boolean;
	violated: boolean;
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

function isProtocolRoleMember(value: unknown, key: string): boolean {
	if (!isNonNullObject(value)) {
		return false;
	}
	return isCallable(Reflect.get(value, key));
}

function validateProtocolRole(
	value: unknown,
	roleMember: "bind" | "accept",
): void {
	for (const key of [roleMember, "shutdown", "close", "cleanup"]) {
		if (!isProtocolRoleMember(value, key)) {
			throw new TypeError(`Protocol role must provide ${key}().`);
		}
	}
}

function validateProtocolFactory(
	value: unknown,
): asserts value is (...arguments_: unknown[]) => unknown {
	if (!isCallable(value)) {
		throw new TypeError("protocolFactory must be callable.");
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
