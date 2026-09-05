/**
 * @overview Shared resource assembly, policy validation, and construction-safe Protocol hosts for RPC Owners.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import { RpcRetainedBytesLedgerImpl } from "@/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcHandlerSchedulerImpl } from "@/impls/owner/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/impls/owner/rpc-owner-custody.impl";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolConnector,
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import { rpcProtocolRuntimePolicySchema } from "@/types/protocol/rpc-runtime-policy.type";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "@/utils/rpc-application-value.util";
import { isCallable, isNonNullObject } from "@/utils/type-guard.util";

/** Creates the guarded host shared by both Owner roles during Protocol assembly. */
export function createRpcOwnerProtocolHost<
	TOwner extends IRpcOwnerProtocolPorts,
>(policy: IRpcProtocolRuntimePolicy) {
	const readiness = new RpcOwnerReadiness<TOwner>();
	return {
		host: createHostBase(policy, readiness),
		activate: (owner: TOwner): void => readiness.activate(owner),
		assertConstructionSafe: (): void => readiness.assertConstructionSafe(),
		readDuringRuntime: <TResult>(
			operation: (owner: TOwner) => TResult,
			constructionResult: TResult,
		): TResult => readiness.readDuringRuntime(operation, constructionResult),
	};
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

export function createRpcOwnerResources(
	policy: IRpcProtocolRuntimePolicy,
	protocol: RpcProtocolRole,
) {
	return {
		retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
			policy.maxRetainedBytesTotal,
		),
		custody: new RpcOwnerCustodyImpl(policy.shutdownDeadlineMs, () =>
			protocol.cleanup(),
		),
		handlerScheduler: new RpcHandlerSchedulerImpl(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		),
	};
}

export function validateRpcOwnerProtocol(
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

export function createRpcOwnerProtocolException(error: unknown): Error {
	return createRpcException(
		RpcExceptionCodeEnum.protocol,
		error instanceof Error ? error : new Error("Protocol construction failed."),
	);
}

interface IRpcOwnerProtocolPorts {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
}

type RpcProtocolRole = IRpcProtocolConnector | IRpcProtocolAcceptor;

function createHostBase<TOwner extends IRpcOwnerProtocolPorts>(
	policy: IRpcProtocolRuntimePolicy,
	readiness: RpcOwnerReadiness<TOwner>,
): IRpcProtocolHost {
	return {
		policy,
		reserveRetainedBytes: (bytes) =>
			readiness.invoke((owner) => owner.reserveRetainedBytes(bytes)),
		normalizeApplicationValue: (value) =>
			readiness.invoke(() => normalizeRpcApplicationValue(value)),
		normalizeApplicationArguments: (value) =>
			readiness.invoke(() => normalizeRpcApplicationArguments(value)),
		applicationValuesEqual: (left, right) =>
			readiness.invoke((owner) => {
				try {
					return rpcApplicationValuesEqual(left, right);
				} catch (error) {
					owner.protocolFault(
						RpcCloseReasonEnum.protocolFault,
						error instanceof Error
							? error
							: new Error("Protocol supplied an invalid Application snapshot."),
					);
					return false;
				}
			}),
		fault: (reason, error) =>
			readiness.invoke((owner) => owner.protocolFault(reason, error)),
	};
}

class RpcOwnerReadiness<TOwner> {
	#owner!: TOwner;
	#ready = false;
	#constructionViolated = false;

	activate(owner: TOwner): void {
		this.assertConstructionSafe();
		this.#owner = owner;
		this.#ready = true;
	}

	assertConstructionSafe(): void {
		if (this.#constructionViolated) {
			throw new TypeError("Protocol mutated its host during construction.");
		}
	}

	invoke<TResult>(operation: (owner: TOwner) => TResult): TResult {
		if (!this.#ready) {
			this.#constructionViolated = true;
			throw new TypeError(
				"Protocol host ports cannot be called during construction.",
			);
		}
		return operation(this.#owner);
	}

	readDuringRuntime<TResult>(
		operation: (owner: TOwner) => TResult,
		constructionResult: TResult,
	): TResult {
		if (!this.#ready) {
			this.#constructionViolated = true;
			return constructionResult;
		}
		return operation(this.#owner);
	}
}
