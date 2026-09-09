/**
 * @overview Creates a cold RPC Acceptor Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	createRpcOwnerProtocolException,
	createRpcOwnerProtocolHost,
	createRpcOwnerResources,
	parseRpcOwnerPolicy,
	validateRpcOwnerProtocol,
} from "@/modules/owner/factories/rpc-owner-assembly.factory";
import { createRpcOwnerTermination } from "@/modules/owner/factories/rpc-owner-termination.factory";
import { createRpcAcceptorSessionOwnership } from "@/modules/owner/factories/rpc-session-ownership.factory";
import { RpcAcceptorImpl } from "@/modules/owner/impls/rpc-acceptor.impl";
import { RpcAcceptorPublisherImpl } from "@/modules/owner/impls/rpc-owner-publisher.impl";
import type { IRpcAcceptor } from "@/modules/owner/interfaces/rpc-acceptor.interface";
import {
	type RpcAcceptorOptions,
	rpcAcceptorOptionsSchema,
} from "@/modules/owner/types/rpc-caller.type";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolAcceptorFactory,
	RpcProtocolFaultReason,
} from "@/modules/protocol";
import {
	createRpcProtocolAcceptor,
	DEFAULT_RPC_RUNTIME_POLICY,
} from "@/modules/protocol";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { isCallable } from "@/shared/utils/type-guard.util";

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
		createTermination: createRpcOwnerTermination,
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
