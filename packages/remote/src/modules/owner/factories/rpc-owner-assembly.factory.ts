/**
 * @overview Assembles Owner resources and guarded Protocol roles from constructor-injected host capabilities.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcHandlerSchedulerImpl } from "@/modules/owner/impls/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/modules/owner/impls/rpc-owner-custody.impl";
import type { RpcOwnerCustodyFactory } from "@/modules/owner/interfaces/rpc-owner-custody.interface";
import type {
	IRpcOwnerProtocolAcceptorPorts,
	IRpcOwnerProtocolConnectorPorts,
	IRpcOwnerProtocolPorts,
} from "@/modules/owner/interfaces/rpc-owner-protocol.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	RpcProtocolAcceptorFactory,
	RpcProtocolConnectorFactory,
} from "@/modules/protocol";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
	rpcProtocolRuntimePolicySchema,
} from "@/modules/protocol";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";
import { RpcRetainedBytesLedgerImpl } from "@/shared/impls/rpc-retained-bytes-ledger.impl";
import { isCallable, isNonNullObject } from "@/shared/utils/type-guard.util";

/** Creates and validates a Connector Protocol with its host dependencies fixed. */
export function createRpcOwnerProtocolConnector(
	policy: IRpcProtocolRuntimePolicy,
	factory: RpcProtocolConnectorFactory,
	ports: IRpcOwnerProtocolConnectorPorts,
): IRpcProtocolConnector {
	return constructProtocol(
		factory,
		(guard) =>
			Object.freeze<IRpcProtocolConnectorHost>({
				...createHostBase(policy, ports, guard),
				attachSession: (session) =>
					guard.readDuringRuntime(
						() => ports.attachSession(session),
						undefined,
					),
			}),
		["bind", "shutdown", "close", "cleanup"],
	);
}

/** Creates and validates an Acceptor Protocol with its host dependencies fixed. */
export function createRpcOwnerProtocolAcceptor(
	policy: IRpcProtocolRuntimePolicy,
	factory: RpcProtocolAcceptorFactory,
	ports: IRpcOwnerProtocolAcceptorPorts,
): IRpcProtocolAcceptor {
	return constructProtocol(
		factory,
		(guard) =>
			Object.freeze<IRpcProtocolAcceptorHost>({
				...createHostBase(policy, ports, guard),
				admitSession: (session) =>
					guard.readDuringRuntime(() => ports.admitSession(session), undefined),
			}),
		["accept", "shutdown", "close", "cleanup"],
	);
}

export function parseRpcOwnerPolicy(
	candidate: unknown,
): IRpcProtocolRuntimePolicy {
	const policyResult = rpcProtocolRuntimePolicySchema.safeParse(candidate);
	if (!policyResult.success) {
		throw new TypeError(policyResult.error.message, {
			cause: policyResult.error,
		});
	}
	return policyResult.data;
}

export function createRpcOwnerResources(policy: IRpcProtocolRuntimePolicy) {
	const createCustody: RpcOwnerCustodyFactory = (cleanupProtocol) =>
		new RpcOwnerCustodyImpl(policy.shutdownDeadlineMs, cleanupProtocol);
	return {
		retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
			policy.maxRetainedBytesTotal,
		),
		createCustody,
		handlerScheduler: new RpcHandlerSchedulerImpl(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		),
	};
}

interface IRpcProtocolConstructionGuard {
	invoke<TResult>(operation: () => TResult): TResult;
	readDuringRuntime<TResult>(
		operation: () => TResult,
		constructionResult: TResult,
	): TResult;
}

function validateRpcOwnerProtocol(
	protocol: unknown,
	members: readonly string[],
): void {
	for (const member of members) {
		if (
			!isNonNullObject(protocol) ||
			!isCallable(Reflect.get(protocol, member))
		) {
			throw new TypeError(`Protocol role must provide ${member}().`);
		}
	}
}

function createHostBase(
	policy: IRpcProtocolRuntimePolicy,
	ports: IRpcOwnerProtocolPorts,
	guard: IRpcProtocolConstructionGuard,
): IRpcProtocolHost {
	return {
		policy,
		reserveRetainedBytes: (bytes) =>
			guard.invoke(() => ports.reserveRetainedBytes(bytes)),
		normalizeApplicationValue: (value) =>
			guard.invoke(() => normalizeRpcApplicationValue(value)),
		normalizeApplicationArguments: (value) =>
			guard.invoke(() => normalizeRpcApplicationArguments(value)),
		applicationValuesEqual: (left, right) =>
			guard.invoke(() => {
				try {
					return rpcApplicationValuesEqual(left, right);
				} catch (error) {
					ports.fault(
						RpcCloseReasonEnum.protocolFault,
						error instanceof Error
							? error
							: new Error("Protocol supplied an invalid Application snapshot."),
					);
					return false;
				}
			}),
		fault: (reason, error) => guard.invoke(() => ports.fault(reason, error)),
	};
}

function constructProtocol<THost, TProtocol>(
	factory: (host: THost) => TProtocol,
	createHost: (guard: IRpcProtocolConstructionGuard) => THost,
	members: readonly string[],
): TProtocol {
	let constructing = true;
	let constructionViolated = false;
	const guard: IRpcProtocolConstructionGuard = {
		invoke: (operation) => {
			if (constructing) {
				constructionViolated = true;
				throw new TypeError(
					"Protocol host ports cannot be called during construction.",
				);
			}
			return operation();
		},
		readDuringRuntime: (operation, constructionResult) => {
			if (constructing) {
				constructionViolated = true;
				return constructionResult;
			}
			return operation();
		},
	};
	try {
		if (!isCallable(factory)) {
			throw new TypeError("protocolFactory must be callable.");
		}
		const protocol = factory(createHost(guard));
		validateRpcOwnerProtocol(protocol, members);
		if (constructionViolated) {
			throw new TypeError("Protocol mutated its host during construction.");
		}
		// Only a successfully validated role may use the already-bound host ports.
		constructing = false;
		return protocol;
	} catch (error) {
		throw createRpcException(
			RpcExceptionCodeEnum.protocol,
			error instanceof Error
				? error
				: new Error("Protocol construction failed."),
		);
	}
}
