/**
 * @overview Owns binding-local Activity Probe intent, silence deadlines, and scheduler-stall grace.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import type {
	IRpcSessionActivity,
	RpcSessionActivityFactory,
} from "@/interfaces/session/rpc-session-activity.interface";
import type { RpcActiveRecord } from "@/types/protocol/rpc-wire-record.type";

export type CreateRpcSessionActivityOptions =
	Parameters<RpcSessionActivityFactory>[0];

/** Tracks valid inbound activity without owning validation, transport, or send fairness. */
export class RpcSessionActivityImpl implements IRpcSessionActivity {
	readonly _activityProbeIntervalMs: number;
	readonly _silenceTimeoutMs: number;
	readonly _onProbeDue: () => void;
	readonly _onSilent: () => void;
	_started = false;
	_stopped = false;
	_pingDue = false;
	_pongDue = false;
	_lastInboundActivityAt = 0;
	_nextProbeAt = 0;
	_stallGraceUntil = 0;
	_timer: ReturnType<typeof setTimeout> | undefined;
	_timerGeneration = 0;

	constructor(options: CreateRpcSessionActivityOptions) {
		this._activityProbeIntervalMs = options.policy.activityProbeIntervalMs;
		this._silenceTimeoutMs = options.policy.silenceTimeoutMs;
		this._onProbeDue = options.onProbeDue;
		this._onSilent = options.onSilent;
	}

	get hasPendingProbe(): boolean {
		return this._pongDue || this._pingDue;
	}

	start(): void {
		if (this._started || this._stopped) {
			return;
		}
		this._started = true;
		const now = Date.now();
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._activityProbeIntervalMs;
		this._scheduleTimer();
	}

	recordInbound(kind: RpcActiveRecord["kind"]): void {
		if (!this._started || this._stopped) {
			return;
		}
		const now = Date.now();
		this._stallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._activityProbeIntervalMs;
		this._pingDue = false;
		if (kind === RpcWireRecordKindEnum.ping) {
			this._pongDue = true;
		}
		this._scheduleTimer();
	}

	takeProbe(): ReturnType<IRpcSessionActivity["takeProbe"]> {
		if (this._pongDue) {
			this._pongDue = false;
			return RpcWireRecordKindEnum.pong;
		}
		if (this._pingDue) {
			this._pingDue = false;
			return RpcWireRecordKindEnum.ping;
		}
		return undefined;
	}

	stop(): void {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		this._pingDue = false;
		this._pongDue = false;
		this._clearTimer();
	}

	_scheduleTimer(): void {
		if (!this._started || this._stopped) {
			return;
		}
		this._clearTimer();
		const silenceAt = Math.max(
			this._lastInboundActivityAt + this._silenceTimeoutMs,
			this._stallGraceUntil,
		);
		const expectedFireAt = Math.min(this._nextProbeAt, silenceAt);
		const generation = this._timerGeneration;
		this._timer = setTimeout(
			() => this._timerFired(generation, expectedFireAt),
			Math.max(0, expectedFireAt - Date.now()),
		);
	}

	_timerFired(generation: number, expectedFireAt: number): void {
		// A canceled callback cannot clear or act on a newer activity timer.
		const timerIsStale = this._stopped || generation !== this._timerGeneration;
		if (timerIsStale) {
			return;
		}
		this._timer = undefined;
		const now = Date.now();
		if (now - expectedFireAt > this._activityProbeIntervalMs) {
			this._pingDue = true;
			this._nextProbeAt = now + this._activityProbeIntervalMs;
			this._stallGraceUntil = this._nextProbeAt;
			this._onProbeDue();
			this._scheduleTimer();
			return;
		}
		// Silence requires both the activity deadline and any fresh stall window to expire.
		const bindingIsSilent =
			now - this._lastInboundActivityAt >= this._silenceTimeoutMs &&
			now >= this._stallGraceUntil;
		if (bindingIsSilent) {
			this.stop();
			this._onSilent();
			return;
		}
		if (now >= this._nextProbeAt) {
			this._pingDue = true;
			this._nextProbeAt = now + this._activityProbeIntervalMs;
			this._onProbeDue();
		}
		this._scheduleTimer();
	}

	_clearTimer(): void {
		this._timerGeneration += 1;
		if (this._timer !== undefined) {
			clearTimeout(this._timer);
			this._timer = undefined;
		}
	}
}
