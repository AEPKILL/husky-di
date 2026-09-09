/**
 * @overview Retains one stable Peer, its attached Session, and reentrant fault fence.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcSessionPeerEnvironment } from "@/modules/owner/interfaces/rpc-session-ownership.interface";
import type { IRpcSessionRecord } from "@/modules/owner/interfaces/rpc-session-record.interface";
import type { RpcSessionOwnershipDependencies } from "@/modules/owner/types/rpc-session-ownership.type";
import { isProtocolSession } from "@/modules/owner/utils/manage-rpc-session.util";
import type {
	IRpcPeer,
	IRpcPeerHost,
	RpcCallEventSink,
	RpcPeerState,
	RpcPeerStateView,
} from "@/modules/peer";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "@/modules/protocol";
import { reserveRpcSessionRetainedBytes } from "@/modules/protocol";

export type CreateRpcSessionRecordOptions = Readonly<{
	readonly initialPeerState: RpcPeerState;
	readonly registerPeer: (
		initialState: RpcPeerState,
		build: (stateView: RpcPeerStateView) => IRpcPeerHost,
	) => IRpcPeerHost;
	readonly callEventSink: RpcCallEventSink;
	readonly peerEnvironment: RpcSessionPeerEnvironment;
	readonly readPeerSession: (
		session: IRpcProtocolSession | undefined,
	) => IRpcProtocolSession | undefined;
	readonly onTransition: (
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	) => void;
	readonly onFault: (
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	) => void;
	readonly onPeerProtocolFault: (
		session: IRpcProtocolSession | undefined,
		error: Error,
	) => void;
}>;

export class RpcSessionRecordImpl implements IRpcSessionRecord {
	readonly #host: IRpcPeerHost;
	readonly #onTransition: CreateRpcSessionRecordOptions["onTransition"];
	readonly #onFault: CreateRpcSessionRecordOptions["onFault"];
	#session: IRpcProtocolSession | undefined;
	#faultFence: IRpcProtocolSession | undefined;

	constructor(
		options: CreateRpcSessionRecordOptions,
		dependencies: RpcSessionOwnershipDependencies,
	) {
		this.#onTransition = options.onTransition;
		this.#onFault = options.onFault;
		this.#host = options.registerPeer(
			options.initialPeerState,
			({ readState, state$ }) =>
				dependencies.createPeer({
					readState,
					state$,
					getSession: () => options.readPeerSession(this.#session),
					findOwnerExposure: options.peerEnvironment.findOwnerExposure,
					isOwnerActive: options.peerEnvironment.isOwnerActive,
					callEventSink: options.callEventSink,
					onProtocolFault: (error) =>
						options.onPeerProtocolFault(this.#session, error),
					handlerScheduler: options.peerEnvironment.handlerScheduler,
					maximumIncomingBytes: options.peerEnvironment.maximumIncomingBytes,
					reserveRetainedBytes: (bytes) =>
						reserveRpcSessionRetainedBytes(
							this.#session,
							options.peerEnvironment.reserveOwnerRetainedBytes,
							bytes,
						),
				}),
		);
	}

	get peer(): IRpcPeer {
		return this.#host.peer;
	}

	get session(): IRpcProtocolSession | undefined {
		return this.#session;
	}

	attach(session: IRpcProtocolSession): IRpcProtocolSessionHost | undefined {
		if (this.#session !== undefined || !isProtocolSession(session)) {
			return undefined;
		}
		this.#session = session;
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request, consume) =>
				this.#host.reserveIncomingCall(request, consume),
			transition: (transition) => this.#onTransition(session, transition),
			fault: (reason, error) => this.#onFault(session, reason, error),
		});
	}

	hasLocalExposure(wireName: string): boolean {
		return this.#host.hasLocalExposure(wireName);
	}

	owns(session: IRpcProtocolSession): boolean {
		return this.#session === session;
	}

	isFenced(session: IRpcProtocolSession): boolean {
		return this.#faultFence === session;
	}

	fence(session: IRpcProtocolSession): (() => void) | undefined {
		if (!this.owns(session) || this.#faultFence !== undefined) {
			return undefined;
		}
		this.#faultFence = session;
		let active = true;
		return () => {
			if (active && this.#faultFence === session) {
				this.#faultFence = undefined;
			}
			active = false;
		};
	}

	release(session?: IRpcProtocolSession): IRpcProtocolSession | undefined {
		const retained = this.#session;
		if (
			retained === undefined ||
			(session !== undefined && retained !== session)
		) {
			return undefined;
		}
		this.#session = undefined;
		return retained;
	}
}
