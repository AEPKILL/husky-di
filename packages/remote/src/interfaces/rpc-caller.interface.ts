/**
 * @overview Caller-facing RPC peer and Topology Owner contracts.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";

import type { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import type { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcEventDirectionEnum } from "@/enums/rpc-event-direction.enum";
import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { RpcStreamStatusEnum } from "@/enums/rpc-stream-status.enum";
import type {
	RpcCallFailure,
	RpcStreamFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/rpc-adapter.interface";
import type {
	RemoteService,
	RemoteServiceImplementation,
	RpcMemberDefinitions,
} from "@/types/remote-service-descriptor.type";
import type {
	RpcAcceptorState,
	RpcConnectorConnectOptions,
	RpcConnectorState,
	RpcPeerState,
} from "@/types/rpc-caller.type";

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
	readonly direction: RpcEventDirectionEnum.outgoing;
	readonly service: string;
	readonly member: string;
};

type RpcKnownIncomingCallContext = {
	readonly direction: RpcEventDirectionEnum.incoming;
	readonly service: string;
	readonly member: string;
};

type RpcUnknownServiceCallContext = {
	readonly direction: RpcEventDirectionEnum.incoming;
	readonly service?: never;
	readonly member?: never;
};

type RpcUnknownMemberCallContext = {
	readonly direction: RpcEventDirectionEnum.incoming;
	readonly service: string;
	readonly member?: never;
};

type RpcCallStartedEvent = RpcCallObservationBase &
	(
		| RpcOutgoingCallContext
		| RpcKnownIncomingCallContext
		| RpcUnknownServiceCallContext
		| RpcUnknownMemberCallContext
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
		| (RpcUnknownMemberCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcExceptionCodeEnum.unknownMember;
		  })
	);

type RpcStreamObservationBase = {
	readonly observationId: string;
	readonly peer: IRpcPeer;
};

type RpcOutgoingStreamContext = {
	readonly direction: RpcEventDirectionEnum.outgoing;
	readonly service: string;
	readonly member: string;
};

type RpcKnownIncomingStreamContext = {
	readonly direction: RpcEventDirectionEnum.incoming;
	readonly service: string;
	readonly member: string;
};

type RpcUnknownServiceStreamContext = {
	readonly direction: RpcEventDirectionEnum.incoming;
	readonly service?: never;
	readonly member?: never;
};

type RpcUnknownMemberStreamContext = {
	readonly direction: RpcEventDirectionEnum.incoming;
	readonly service: string;
	readonly member?: never;
};

type RpcStreamStartedEvent = RpcStreamObservationBase &
	(
		| RpcOutgoingStreamContext
		| RpcKnownIncomingStreamContext
		| RpcUnknownServiceStreamContext
		| RpcUnknownMemberStreamContext
	) & { readonly type: RpcEventTypeEnum.streamStarted };

type RpcStreamFinishedBase = RpcStreamObservationBase & {
	readonly type: RpcEventTypeEnum.streamFinished;
	readonly durationMs: number;
};

type RpcStreamFinishedEvent = RpcStreamFinishedBase &
	(
		| (RpcOutgoingStreamContext & {
				readonly outcome:
					| RpcStreamStatusEnum.completed
					| RpcStreamStatusEnum.canceled;
				readonly deliveredItemCount: number;
		  })
		| (RpcOutgoingStreamContext & {
				readonly outcome: RpcStreamStatusEnum.failed;
				readonly code: RpcStreamFailure;
				readonly deliveredItemCount: number;
		  })
		| (RpcKnownIncomingStreamContext & {
				readonly outcome:
					| RpcStreamStatusEnum.completed
					| RpcStreamStatusEnum.canceled
					| RpcStreamStatusEnum.terminated;
				readonly admittedItemCount: number;
				readonly sourceTeardownFailed?: true;
		  })
		| (RpcKnownIncomingStreamContext & {
				readonly outcome: RpcStreamStatusEnum.failed;
				readonly code:
					| RpcExceptionCodeEnum.handlerFailed
					| RpcExceptionCodeEnum.overflow;
				readonly admittedItemCount: number;
				readonly sourceTeardownFailed?: true;
		  })
		| (RpcUnknownServiceStreamContext & {
				readonly outcome: RpcStreamStatusEnum.failed;
				readonly code: RpcExceptionCodeEnum.unknownService;
				readonly admittedItemCount: 0;
		  })
		| (RpcUnknownMemberStreamContext & {
				readonly outcome: RpcStreamStatusEnum.failed;
				readonly code: RpcExceptionCodeEnum.unknownMember;
				readonly admittedItemCount: 0;
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
	| RpcCallFinishedEvent
	| RpcStreamStartedEvent
	| RpcStreamFinishedEvent;

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

	shutdown(): Promise<void>;
	close(): Promise<void>;
}
