/**
 * @overview Creates a cold RPC Acceptor Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { DEFAULT_RPC_RUNTIME_POLICY } from "@/constants/protocol/rpc-runtime-policy.const";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import {
	createRpcOwnerProtocolException,
	createRpcOwnerProtocolHost,
	createRpcOwnerResources,
	parseRpcOwnerPolicy,
	validateRpcOwnerProtocol,
} from "@/factories/rpc-owner-assembly.factory";
import { createRpcProtocolAcceptor } from "@/factories/rpc-protocol.factory";
import { createRpcAcceptorSessionOwnership } from "@/factories/rpc-session-ownership.factory";
import { RpcAcceptorImpl } from "@/impls/owner/rpc-acceptor.impl";
import { RpcAcceptorPublisherImpl } from "@/impls/owner/rpc-owner-publisher.impl";
import type { IRpcAcceptor } from "@/interfaces/owner/rpc-acceptor.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import {
	type RpcAcceptorOptions,
	rpcAcceptorOptionsSchema,
} from "@/types/common/rpc-caller.type";
import type { RpcProtocolAcceptorFactory } from "@/types/protocol/rpc-protocol-factory.type";
import { isCallable } from "@/utils/type-guard.util";

/** Creates a cold Acceptor without starting transport I/O. */
export function createRpcAcceptor(options?: RpcAcceptorOptions): IRpcAcceptor {
	const parsed = parseAcceptorOptions(options);
	const construction = createRpcOwnerProtocolHost<IRpcAcceptorProtocolPorts>(
		parsed.policy,
	);
	let protocol: IRpcProtocolAcceptor;
	try {
		const factory =
			parsed.protocolFactory === undefined
				? createRpcProtocolAcceptor
				: parsed.protocolFactory;
		if (!isCallable(factory)) {
			throw new TypeError("protocolFactory must be callable.");
		}
		protocol = factory(
			Object.freeze({
				...construction.host,
				admitSession: (session: IRpcProtocolSession) =>
					construction.readDuringRuntime(
						(owner) => owner.admitProtocolSession(session),
						undefined,
					),
			}),
		);
		validateRpcOwnerProtocol(protocol, [
			"accept",
			"shutdown",
			"close",
			"cleanup",
		]);
		construction.assertConstructionSafe();
	} catch (error) {
		throw createRpcOwnerProtocolException(error);
	}
	const owner = new RpcAcceptorImpl({
		protocol,
		policy: parsed.policy,
		publisher: new RpcAcceptorPublisherImpl({
			initialState: Object.freeze({
				status: RpcStateStatusEnum.active,
				listener: Object.freeze({ status: RpcStateStatusEnum.idle }),
			}),
		}),
		...createRpcOwnerResources(parsed.policy, protocol),
		createSessionOwnership: createRpcAcceptorSessionOwnership,
	});
	construction.activate(owner);
	return owner;
}

interface IRpcAcceptorProtocolPorts {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
	admitProtocolSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

function parseAcceptorOptions(options: RpcAcceptorOptions | undefined): {
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly protocolFactory: RpcProtocolAcceptorFactory | undefined;
} {
	const optionsResult = rpcAcceptorOptionsSchema.safeParse(
		options === undefined ? {} : options,
	);
	if (!optionsResult.success) {
		throw new TypeError(optionsResult.error.message, {
			cause: optionsResult.error,
		});
	}
	const { protocolFactory, runtimePolicy } = optionsResult.data;
	return {
		policy: parseRpcOwnerPolicy({
			...DEFAULT_RPC_RUNTIME_POLICY,
			...runtimePolicy,
		}),
		protocolFactory,
	};
}
