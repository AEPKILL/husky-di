/**
 * @overview Caller-facing RPC peer and Topology Owner contracts.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";

import type { RpcCallDirectionEnum } from "@/enums/rpc-call-direction.enum";
import type { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import type { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { RpcException } from "@/exceptions/rpc.exception";
import type { RpcCallFailure } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/rpc-adapter.interface";
import type {
	AnyMethod,
	IsCancelableMethod,
	RemoteMethodKey,
	RemoteService,
	RemoteServiceImplementation,
	RpcMemberDefinitions,
	SelectedUnaryMemberKey,
} from "@/types/remote-service-descriptor.type";
import type {
	RpcAcceptorState,
	RpcConnectorConnectOptions,
	RpcConnectorState,
	RpcPeerState,
} from "@/types/rpc-caller.type";

export type RpcPeerResult<T> =
	| {
			readonly peer: IRpcPeer;
			readonly status: RpcCallStatusEnum.fulfilled;
			readonly value: T;
	  }
	| {
			readonly peer: IRpcPeer;
			readonly status: RpcCallStatusEnum.rejected;
			readonly reason: RpcException;
	  };

type RemoteGroupMethod<F, Definition> = F extends (
	...args: infer Arguments
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Arguments extends [...infer Parameters, AbortSignal]
			? (
					...args: [...Parameters, signal: AbortSignal | undefined]
				) => Promise<readonly RpcPeerResult<Awaited<Result>>[]>
			: never
		: (...args: Arguments) => Promise<readonly RpcPeerResult<Awaited<Result>>[]>
	: never;

export type RemoteServiceGroup<
	T,
	Definitions extends RpcMemberDefinitions<T>,
> = {
	readonly [K in Extract<
		SelectedUnaryMemberKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteGroupMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
} & { readonly then?: never };

export interface IRpcPeer {
	readonly state: RpcPeerState;
	readonly state$: Observable<RpcPeerState>;

	expose<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	resolve<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions>;
}

type RpcCallObservationBase = {
	readonly observationId: string;
	readonly peer: IRpcPeer;
};

type RpcOutgoingCallContext = {
	readonly direction: RpcCallDirectionEnum.outgoing;
	readonly service: string;
	readonly method: string;
};

type RpcKnownIncomingCallContext = {
	readonly direction: RpcCallDirectionEnum.incoming;
	readonly service: string;
	readonly method: string;
};

type RpcUnknownServiceCallContext = {
	readonly direction: RpcCallDirectionEnum.incoming;
	readonly service?: never;
	readonly method?: never;
};

type RpcUnknownMethodCallContext = {
	readonly direction: RpcCallDirectionEnum.incoming;
	readonly service: string;
	readonly method?: never;
};

type RpcCallStartedEvent = RpcCallObservationBase &
	(
		| RpcOutgoingCallContext
		| RpcKnownIncomingCallContext
		| RpcUnknownServiceCallContext
		| RpcUnknownMethodCallContext
	) & { readonly type: RpcEventTypeEnum.callStarted };

type RpcCallFinishedBase = RpcCallObservationBase & {
	readonly type: RpcEventTypeEnum.callFinished;
	readonly durationMs: number;
};

type RpcCallFinishedEvent = RpcCallFinishedBase &
	(
		| (RpcOutgoingCallContext & {
				readonly outcome: RpcCallStatusEnum.fulfilled;
		  })
		| (RpcOutgoingCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcCallFailure;
		  })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: RpcCallStatusEnum.fulfilled;
		  })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code:
					| RpcExceptionCodeEnum.canceled
					| RpcExceptionCodeEnum.handlerFailed;
		  })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: RpcCallStatusEnum.terminated;
		  })
		| (RpcUnknownServiceCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcExceptionCodeEnum.unknownService;
		  })
		| (RpcUnknownMethodCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcExceptionCodeEnum.unknownMethod;
		  })
	);

type RpcPeerLifecycleEvent =
	| {
			readonly type:
				| RpcEventTypeEnum.peerOpened
				| RpcEventTypeEnum.peerRecovering
				| RpcEventTypeEnum.peerRecovered;
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerDraining;
			readonly peer: IRpcPeer;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.counterExhaustion;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerClosed;
			readonly peer: IRpcPeer;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: Extract<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated
			>;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerClosed;
			readonly peer: IRpcPeer;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: Extract<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.recoveryExpired
				| RpcCloseReasonEnum.counterExhaustion
				| RpcCloseReasonEnum.continuityFailure
				| RpcCloseReasonEnum.protocolFault
				| RpcCloseReasonEnum.resourceFault
			>;
	  };

type RpcTopologyLifecycleEvent =
	| { readonly type: RpcEventTypeEnum.ownerDraining }
	| { readonly type: RpcEventTypeEnum.ownerClosing }
	| {
			readonly type: RpcEventTypeEnum.topologyClosed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: Extract<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated
			>;
	  }
	| {
			readonly type: RpcEventTypeEnum.topologyClosed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: Exclude<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated
			>;
	  };

export type RpcEvent =
	| RpcTopologyLifecycleEvent
	| RpcPeerLifecycleEvent
	| RpcCallStartedEvent
	| RpcCallFinishedEvent;

export interface IRpcConnector {
	readonly state: RpcConnectorState;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: IRpcPeer;
	connect(options: RpcConnectorConnectOptions): Promise<void>;
	shutdown(): Promise<void>;
	close(): Promise<void>;
}

export interface IRpcAcceptor {
	readonly state: RpcAcceptorState;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	expose<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	listen(adapter: IRpcAcceptorAdapter): Promise<void>;

	resolveAll<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteServiceGroup<T, Definitions>;

	shutdown(): Promise<void>;
	close(): Promise<void>;
}
