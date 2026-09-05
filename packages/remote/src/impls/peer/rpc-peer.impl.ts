/**
 * @overview Stable RPC Peer identity, state, exposure ownership and remote facades.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerCallLifecycle,
	RpcPeerCallLifecycleFactory,
} from "@/interfaces/peer/rpc-peer-call-lifecycle.interface";
import type { RpcPeerStateView } from "@/interfaces/peer/rpc-peer-host.interface";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
	RpcProtocolIncomingCallReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type {
	RpcExposure,
	RpcExposureRegistry,
} from "@/types/common/rpc-exposure.type";
import type {
	RemoteService,
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/peer/remote-service-descriptor.type";
import type { RpcCallEventSink } from "@/types/peer/rpc-peer-call-event.type";
import { installRpcExposure } from "@/utils/rpc-exposure.util";
import { createRpcFacade } from "@/utils/rpc-facade.util";

export type CreateRpcPeerOptions = RpcPeerStateView &
	Readonly<{
		readonly getSession: () => IRpcProtocolSession | undefined;
		readonly findOwnerExposure: (wireName: string) => RpcExposure | undefined;
		readonly isOwnerActive: () => boolean;
		readonly callEventSink: RpcCallEventSink;
		readonly onProtocolFault: (error: Error) => void;
		readonly handlerScheduler: IRpcHandlerScheduler;
		readonly maximumIncomingBytes: number;
		readonly reserveRetainedBytes: (
			bytes: number,
		) => IRpcRetainedBytesReservation | undefined;
	}>;

/** Retains stable Peer identity, state, exposure ownership and remote service facades. */
export class RpcPeerImpl implements IRpcPeer {
	readonly #localExposures: RpcExposureRegistry = new Map();
	readonly #readState: () => RpcPeerState;
	readonly #findOwnerExposure: (wireName: string) => RpcExposure | undefined;
	readonly #isOwnerActive: () => boolean;
	readonly #stateStream: Observable<RpcPeerState>;
	readonly #callLifecycle: IRpcPeerCallLifecycle;

	constructor(
		options: CreateRpcPeerOptions,
		createCallLifecycle: RpcPeerCallLifecycleFactory,
	) {
		this.#readState = options.readState;
		this.#findOwnerExposure = options.findOwnerExposure;
		this.#isOwnerActive = options.isOwnerActive;
		this.#stateStream = options.state$;
		this.#callLifecycle = createCallLifecycle({
			peer: this,
			getSession: options.getSession,
			findExposure: (wireName) =>
				this.#localExposures.get(wireName) ?? this.#findOwnerExposure(wireName),
			isOwnerActive: options.isOwnerActive,
			callEventSink: options.callEventSink,
			onProtocolFault: options.onProtocolFault,
			handlerScheduler: options.handlerScheduler,
			maximumIncomingBytes: options.maximumIncomingBytes,
			reserveRetainedBytes: options.reserveRetainedBytes,
		});
		options.state$.subscribe({ complete: () => this.#localExposures.clear() });
	}

	get state(): RpcPeerState {
		return this.#readState();
	}

	get state$(): Observable<RpcPeerState> {
		return this.#stateStream;
	}

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: RemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup {
		// Exposure changes require an active owner and a non-terminal Peer.
		const cannotExposeService =
			!this.#isOwnerActive() ||
			this.state.status === RpcStateStatusEnum.draining ||
			this.state.status === RpcStateStatusEnum.closed;
		if (cannotExposeService) {
			throw createRpcException(RpcExceptionCodeEnum.unavailable);
		}
		return installRpcExposure(
			descriptor,
			implementation,
			(wireName) =>
				this.#localExposures.has(wireName) ||
				this.#findOwnerExposure(wireName) !== undefined,
			(exposure) => this.#installLocalExposure(exposure),
		);
	}

	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: RemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions> {
		const service = getRemoteServiceDescriptorData(descriptor).wireName;
		return createRpcFacade(descriptor, (method, cancelable, actualArguments) =>
			this.#callLifecycle.invoke(service, method, cancelable, actualArguments),
		);
	}

	/** Lends a synchronous reservation through the Framework call-lifecycle module. */
	reserveIncomingCall(
		request: IRpcProtocolCallRequest,
		consume: (reservation: RpcProtocolIncomingCallReservation) => undefined,
	): boolean {
		return this.#callLifecycle.reserveIncomingCall(request, consume);
	}

	hasLocalExposure(wireName: string): boolean {
		return this.#localExposures.has(wireName);
	}

	#installLocalExposure(exposure: RpcExposure): Cleanup {
		this.#localExposures.set(exposure.wireName, exposure);
		let active = true;
		return () => {
			if (active && this.#localExposures.get(exposure.wireName) === exposure) {
				this.#localExposures.delete(exposure.wireName);
			}
			active = false;
		};
	}
}
