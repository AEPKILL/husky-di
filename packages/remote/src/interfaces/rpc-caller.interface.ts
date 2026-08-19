/**
 * @overview Caller-facing RPC peer and Topology Owner contracts.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable } from "rxjs";

import type { RpcError } from "@/exceptions/rpc-error.exception";
import type { RpcCallFailure } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@/interfaces/rpc-adapter.interface";
import type {
	AnyMethod,
	IsCancelableMethod,
	RemoteMethodKey,
	RemoteService,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
	SelectedMethodKey,
} from "@/types/remote-service-descriptor.type";
import type {
	RpcAcceptorOptions,
	RpcAcceptorState,
	RpcConnectorOptions,
	RpcConnectorState,
	RpcPeerState,
	RpcTopologyCloseReason,
} from "@/types/rpc-caller.type";

export type RpcPeerResult<T> =
	| {
			readonly peer: IRpcPeer;
			readonly status: "fulfilled";
			readonly value: T;
	  }
	| {
			readonly peer: IRpcPeer;
			readonly status: "rejected";
			readonly reason: RpcError;
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
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteGroupMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
} & { readonly then?: never };

export interface IRpcPeer {
	readonly state: RpcPeerState;
	readonly state$: Observable<RpcPeerState>;

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions>;
}

export type RpcCallDirection = "incoming" | "outgoing";

type RpcCallObservationBase = {
	readonly observationId: string;
	readonly peer: IRpcPeer;
};

type RpcOutgoingCallContext = {
	readonly direction: "outgoing";
	readonly service: string;
	readonly method: string;
};

type RpcKnownIncomingCallContext = {
	readonly direction: "incoming";
	readonly service: string;
	readonly method: string;
};

type RpcUnknownServiceCallContext = {
	readonly direction: "incoming";
	readonly service?: never;
	readonly method?: never;
};

type RpcUnknownMethodCallContext = {
	readonly direction: "incoming";
	readonly service: string;
	readonly method?: never;
};

type RpcCallStartedEvent = RpcCallObservationBase &
	(
		| RpcOutgoingCallContext
		| RpcKnownIncomingCallContext
		| RpcUnknownServiceCallContext
		| RpcUnknownMethodCallContext
	) & { readonly type: "call-started" };

type RpcCallFinishedBase = RpcCallObservationBase & {
	readonly type: "call-finished";
	readonly durationMs: number;
};

type RpcCallFinishedEvent = RpcCallFinishedBase &
	(
		| (RpcOutgoingCallContext & { readonly outcome: "fulfilled" })
		| (RpcOutgoingCallContext & {
				readonly outcome: "rejected";
				readonly code: RpcCallFailure;
		  })
		| (RpcKnownIncomingCallContext & { readonly outcome: "fulfilled" })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: "rejected";
				readonly code: "canceled" | "handler-failed";
		  })
		| (RpcKnownIncomingCallContext & { readonly outcome: "terminated" })
		| (RpcUnknownServiceCallContext & {
				readonly outcome: "rejected";
				readonly code: "unknown-service";
		  })
		| (RpcUnknownMethodCallContext & {
				readonly outcome: "rejected";
				readonly code: "unknown-method";
		  })
	);

type RpcPeerLifecycleEvent =
	| {
			readonly type: "peer-opened" | "peer-recovering" | "peer-recovered";
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: "peer-draining";
			readonly peer: IRpcPeer;
			readonly reason: "graceful-shutdown" | "counter-exhaustion";
	  }
	| {
			readonly type: "peer-closed";
			readonly peer: IRpcPeer;
			readonly outcome: "normal";
			readonly reason: Extract<
				RpcTopologyCloseReason,
				| "graceful-shutdown"
				| "forced-close"
				| "shutdown-deadline"
				| "remote-terminated"
			>;
	  }
	| {
			readonly type: "peer-closed";
			readonly peer: IRpcPeer;
			readonly outcome: "failed";
			readonly reason: Extract<
				RpcTopologyCloseReason,
				| "recovery-expired"
				| "counter-exhaustion"
				| "continuity-failure"
				| "protocol-fault"
				| "resource-fault"
			>;
	  };

type RpcTopologyLifecycleEvent =
	| { readonly type: "owner-draining" }
	| { readonly type: "owner-closing" }
	| {
			readonly type: "topology-closed";
			readonly outcome: "normal";
			readonly reason: Extract<
				RpcTopologyCloseReason,
				| "graceful-shutdown"
				| "forced-close"
				| "shutdown-deadline"
				| "remote-terminated"
			>;
	  }
	| {
			readonly type: "topology-closed";
			readonly outcome: "failed";
			readonly reason: Exclude<
				RpcTopologyCloseReason,
				| "graceful-shutdown"
				| "forced-close"
				| "shutdown-deadline"
				| "remote-terminated"
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
	connect(adapter: IRpcConnectorAdapter): Promise<void>;
	shutdown(): Promise<void>;
	close(): Promise<void>;
}

export interface IRpcAcceptor {
	readonly state: RpcAcceptorState;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup;

	listen(adapter: IRpcAcceptorAdapter): Promise<void>;

	resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteServiceGroup<T, Definitions>;

	shutdown(): Promise<void>;
	close(): Promise<void>;
}

export type RpcConnectorFactory = (
	options?: RpcConnectorOptions,
) => IRpcConnector;

export type RpcAcceptorFactory = (options?: RpcAcceptorOptions) => IRpcAcceptor;
