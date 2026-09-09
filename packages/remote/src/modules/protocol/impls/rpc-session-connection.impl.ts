/**
 * @overview Owns exact binding activation and its connection-local Activity Probe lifetime.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RpcDecodePhaseEnum } from "@/modules/protocol/enums/rpc-decode-phase.enum";
import { RpcEndpointFailureEnum } from "@/modules/protocol/enums/rpc-endpoint-failure.enum";
import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";
import type { IRpcRetainedBytesReservation } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type { IRpcSessionActivity } from "@/modules/protocol/interfaces/rpc-session-activity.interface";
import type {
	IRpcSessionConnection,
	RpcSessionConnectionFactory,
} from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type { RpcActiveRecord } from "@/modules/protocol/types/rpc-wire-record.type";
import { deferRpcEndpointClose } from "@/modules/protocol/utils/rpc-direct-close.util";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export type CreateRpcSessionConnectionOptions =
	Parameters<RpcSessionConnectionFactory>[0];

export class RpcSessionConnectionImpl implements IRpcSessionConnection {
	readonly endpoint: IRpcEndpoint;
	readonly _options: CreateRpcSessionConnectionOptions;
	_active = false;
	_activationAttempted = false;
	_activity: IRpcSessionActivity | undefined;

	constructor(options: CreateRpcSessionConnectionOptions) {
		this.endpoint = options.endpoint;
		this._options = Object.freeze({ ...options });
	}

	get isActive(): boolean {
		return this._active;
	}
	get activity(): IRpcSessionActivity | undefined {
		return this._activity;
	}

	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this._options.isCurrent(this)
			? this._options.reserveRetainedBytes(bytes)
			: undefined;
	}

	receive(bytes: Uint8Array): void {
		if (this._options.isClosed()) {
			return;
		}
		// Ingress is accepted only from the active current binding of an open Session.
		const bindingCannotReceive =
			!this._options.isCurrent(this) || !this._active;
		if (bindingCannotReceive) {
			deferRpcEndpointClose(this.endpoint);
			return;
		}

		let record: RpcActiveRecord;
		try {
			record = this._options.codec.decode(bytes, RpcDecodePhaseEnum.active);
		} catch (error) {
			this._options.onFault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC active record is invalid."),
			);
			return;
		}

		if (record.kind === RpcWireRecordKindEnum.ack) {
			if (this._options.delivery.acknowledge(record.ackThrough)) {
				this.recordInboundActivity(record.kind);
			}
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.ping) {
			this.recordInboundActivity(record.kind);
			this._options.delivery.pump();
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.pong) {
			this.recordInboundActivity(record.kind);
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.close) {
			if (this._active && this._options.isCurrent(this))
				this._options.onPeerClose();
			return;
		}
		if (record.kind !== RpcWireRecordKindEnum.message) {
			this._options.onFault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC active phase produced an invalid record kind."),
			);
			return;
		}
		if (this._options.delivery.receiveEnvelope(record)) {
			this.recordInboundActivity(record.kind);
		}
	}

	fail(reason: RpcEndpointFailureEnum, error?: Error): void {
		if (!this._options.isCurrent(this)) {
			return;
		}
		// Protocol and resource failures terminate the Session instead of recovering it.
		const isTerminalFailure =
			reason === RpcEndpointFailureEnum.protocol ||
			reason === RpcEndpointFailureEnum.resource;
		if (isTerminalFailure) {
			this._options.onFault(
				reason === RpcEndpointFailureEnum.protocol
					? RpcCloseReasonEnum.protocolFault
					: RpcCloseReasonEnum.resourceFault,
				error ?? new Error(`Default RPC endpoint ${reason} failure.`),
			);
			return;
		}
		this._options.onLoss(error);
	}

	activate(): boolean {
		if (this._activationAttempted) return false;
		this._activationAttempted = true;
		if (!this._options.isCurrent(this)) return false;
		this._active = true;
		return this._options.onActivate(this);
	}

	sendClose(): Promise<void> | undefined {
		let encoded: Uint8Array;
		try {
			encoded = this._options.codec.encode({
				kind: RpcWireRecordKindEnum.close,
			});
		} catch {
			return undefined;
		}
		return this.endpoint.sendNow(encoded);
	}

	startActivity(): void {
		this.stopActivity();
		const activity = this._options.createActivity({
			policy: this._options.policy,
			onProbeDue: () => {
				if (this._options.isCurrent(this)) this._options.onReady();
			},
			onSilent: () => {
				if (this._options.isCurrent(this))
					this.fail(
						RpcEndpointFailureEnum.connection,
						new Error("Default RPC binding became silent."),
					);
			},
		});
		this._activity = activity;
		activity.start();
	}

	recordInboundActivity(kind: RpcActiveRecord["kind"]): void {
		// Validation can reenter the Session; only the surviving binding owns activity.
		if (this._active && this._options.isCurrent(this))
			this._activity?.recordInbound(kind);
	}

	stopActivity(): void {
		const activity = this._activity;
		this._activity = undefined;
		activity?.stop();
	}
}
