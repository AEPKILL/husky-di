/**
 * @overview Owns the stable Connector Peer and exact Session attachment authority.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IRpcConnectorLifecycleState } from "@/modules/owner/interfaces/rpc-connector-lifecycle-state.interface";
import type {
	IRpcConnectorSessionLifecycle,
	IRpcConnectorSessionLifecycleAttachment,
	IRpcConnectorSessionLifecycleOwner,
	RpcConnectorSessionLifecycleFactory,
} from "@/modules/owner/interfaces/rpc-connector-session-lifecycle.interface";
import type { RpcOwnerCloseReason } from "@/modules/owner/types/rpc-owner-close-reason.type";
import type { IRpcPeer, RpcSessionClosedState } from "@/modules/peer";
import {
	type IRpcProtocolSessionLifecycle,
	type RpcProtocolFaultReason,
	type RpcProtocolSessionTransition,
	RpcProtocolSessionTransitionTypeEnum,
	type RpcSessionCloseReason,
} from "@/modules/protocol";
import { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { RpcException } from "@/shared/exceptions/rpc.exception";

export type CreateRpcConnectorSessionLifecycleOptions =
	Parameters<RpcConnectorSessionLifecycleFactory>[0];

export class RpcConnectorSessionLifecycleImpl
	implements IRpcConnectorSessionLifecycle
{
	readonly peer: IRpcPeer;

	private readonly _state: IRpcConnectorLifecycleState;
	private readonly _owner: IRpcConnectorSessionLifecycleOwner;
	private _attachment: RpcSessionAttachment | undefined;
	private _closing = false;
	private _counterDraining = false;

	constructor(options: CreateRpcConnectorSessionLifecycleOptions) {
		this._state = options.state;
		this._owner = options.owner;
		this.peer = options.createPeer(this._state.peerStateView);
	}

	get attached(): boolean {
		return this._attachment !== undefined;
	}

	attach(
		session: IRpcProtocolSessionLifecycle,
	): IRpcConnectorSessionLifecycleAttachment | undefined {
		const canAttach =
			!this._closing &&
			this._attachment === undefined &&
			this._state.state.status === RpcStateStatusEnum.active;
		if (!canAttach) return undefined;
		const record: RpcSessionAttachment = {
			session,
			active: false,
			attachment: {
				host: {
					transition: (transition) => this._transition(record, transition),
					fault: (reason, error) => this._fault(record, reason, error),
				},
				get active() {
					return record.active;
				},
				activate: (canActivate) => this._activate(record, canActivate),
				discard: () => this._discard(record),
			},
		};
		this._attachment = record;
		return record.attachment;
	}

	beginGracefulShutdown(): void {
		if (this._closing || this._state.state.status !== RpcStateStatusEnum.active)
			return;
		const peerState = this._state.peerStateView.readState();
		const canDrain =
			this._attachment?.active === true &&
			(peerState.status === RpcStateStatusEnum.connected ||
				peerState.status === RpcStateStatusEnum.draining);
		if (canDrain) {
			this._state.commit(
				{ status: RpcStateStatusEnum.draining },
				peerState.status === RpcStateStatusEnum.draining
					? peerState
					: {
							status: RpcStateStatusEnum.draining,
							reason: RpcCloseReasonEnum.gracefulShutdown,
						},
			);
		} else {
			this.beginClosing(
				peerState.status === RpcStateStatusEnum.recovering
					? RpcCloseReasonEnum.forcedClose
					: RpcCloseReasonEnum.gracefulShutdown,
				true,
			);
		}
	}

	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void {
		this._finish(
			{
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			},
			forced,
		);
	}

	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		this._finish(
			{
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: new RpcException(RpcExceptionCodeEnum.protocol, error),
			},
			true,
		);
	}

	private _activate(
		record: RpcSessionAttachment,
		canActivate: () => boolean,
	): boolean {
		const eligible = () =>
			!this._closing &&
			this._attachment === record &&
			!record.active &&
			this._state.state.status === RpcStateStatusEnum.active &&
			this._state.peerStateView.readState().status ===
				RpcStateStatusEnum.connecting;
		if (!eligible() || !canActivate() || !eligible()) return false;
		record.active = true;
		this._state.commit(this._state.state, {
			status: RpcStateStatusEnum.connected,
		});
		return true;
	}

	private _discard(record: RpcSessionAttachment): void {
		if (this._attachment !== record || record.active) return;
		this._attachment = undefined;
		record.session.forceClose();
	}

	private _finish(state: RpcSessionClosedState, forced: boolean): void {
		if (this._closing) return;
		this._closing = true;
		const record = this._attachment;
		this._attachment = undefined;
		if (record !== undefined) record.active = false;
		try {
			this._owner.beginClosing(state, forced);
		} finally {
			try {
				if (forced) record?.session.forceClose();
			} finally {
				this._state.commit({ status: RpcStateStatusEnum.closing }, state);
			}
		}
	}

	private _transition(
		record: RpcSessionAttachment,
		transition: RpcProtocolSessionTransition,
	): void {
		if (this._attachment !== record || this._closing) return;
		if (!record.active) {
			const provisionalEnded =
				transition.type === RpcProtocolSessionTransitionTypeEnum.closed ||
				transition.type === RpcProtocolSessionTransitionTypeEnum.recovering;
			if (provisionalEnded) {
				this._failAttachment(
					record,
					new RpcException(RpcExceptionCodeEnum.unavailable, transition.cause),
				);
			}
			return;
		}
		const peerState = this._state.peerStateView.readState();
		switch (transition.type) {
			case RpcProtocolSessionTransitionTypeEnum.closed:
				this._finish(
					createSessionClosedState(transition.reason, transition.cause),
					false,
				);
				return;
			case RpcProtocolSessionTransitionTypeEnum.draining:
				this._counterDraining = true;
				if (peerState.status === RpcStateStatusEnum.connected) {
					this._state.commit(this._state.state, {
						status: RpcStateStatusEnum.draining,
						reason: RpcCloseReasonEnum.counterExhaustion,
					});
				}
				return;
			case RpcProtocolSessionTransitionTypeEnum.recovering:
				if (this._state.state.status === RpcStateStatusEnum.draining) {
					this.beginClosing(RpcCloseReasonEnum.forcedClose, true);
				} else if (peerState.status !== RpcStateStatusEnum.recovering) {
					this._state.commit(this._state.state, {
						status: RpcStateStatusEnum.recovering,
					});
				}
				return;
			case RpcProtocolSessionTransitionTypeEnum.recovered:
				if (
					peerState.status === RpcStateStatusEnum.recovering &&
					this._state.state.status === RpcStateStatusEnum.active
				) {
					this._state.commit(
						this._state.state,
						this._counterDraining
							? {
									status: RpcStateStatusEnum.draining,
									reason: RpcCloseReasonEnum.counterExhaustion,
								}
							: { status: RpcStateStatusEnum.connected },
					);
				}
		}
	}

	private _fault(
		record: RpcSessionAttachment,
		reason: RpcProtocolFaultReason,
		error: Error,
	): void {
		if (this._attachment !== record || this._closing) return;
		if (record.active) {
			this.protocolFault(reason, error);
		} else {
			this._failAttachment(
				record,
				new RpcException(RpcExceptionCodeEnum.protocol, error),
			);
		}
	}

	private _failAttachment(record: RpcSessionAttachment, error: Error): void {
		try {
			this._discard(record);
		} finally {
			this._owner.failAttachment(record.attachment, error);
		}
	}
}

type RpcSessionAttachment = {
	readonly session: IRpcProtocolSessionLifecycle;
	readonly attachment: IRpcConnectorSessionLifecycleAttachment;
	active: boolean;
};

function createSessionClosedState(
	reason: RpcSessionCloseReason,
	cause?: Error,
): RpcSessionClosedState {
	switch (reason) {
		case RpcCloseReasonEnum.recoveryExpired:
		case RpcCloseReasonEnum.counterExhaustion:
			return {
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: new RpcException(RpcExceptionCodeEnum.unavailable, cause),
			};
		case RpcCloseReasonEnum.continuityFailure:
		case RpcCloseReasonEnum.protocolFault:
		case RpcCloseReasonEnum.resourceFault:
			return {
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: new RpcException(RpcExceptionCodeEnum.protocol, cause),
			};
		default:
			return {
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			};
	}
}
