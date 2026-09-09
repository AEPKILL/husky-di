/**
 * @overview Owns retained resume credentials, binding generations, and one-shot authority decisions.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RPC_PROFILE } from "@/modules/protocol/constants/rpc-profile.const";
import { RpcPeerCursorClassificationEnum } from "@/modules/protocol/enums/rpc-peer-cursor-classification.enum";
import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";
import type { IRpcProtocolSessionHost } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type {
	IRpcBindingPlan,
	IRpcResumeAttempt,
	IRpcSessionBinding,
	IRpcSessionTerminationPlan,
	RpcResumeClaim,
	RpcResumeDecision,
	RpcResumeOutcome,
} from "@/modules/protocol/interfaces/rpc-session.interface";
import type { IRpcSessionConnection } from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type {
	IRpcSessionContinuity,
	RpcSessionContinuityFactory,
} from "@/modules/protocol/interfaces/rpc-session-continuity.interface";
import { rpcSecurityCarriersEqual } from "@/modules/protocol/utils/rpc-base64-url-32-schema.util";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export type CreateRpcSessionContinuityOptions =
	Parameters<RpcSessionContinuityFactory>[0];

export class RpcSessionContinuityImpl implements IRpcSessionContinuity {
	readonly _sessionId: string;
	readonly _inspect: CreateRpcSessionContinuityOptions["inspect"];
	readonly _install: CreateRpcSessionContinuityOptions["installBinding"];
	readonly _onTerminate: CreateRpcSessionContinuityOptions["onTerminate"];
	_resumeToken: string | undefined;
	_sessionHost: IRpcProtocolSessionHost | undefined;
	_bindingEpoch = 0;
	_resumeAttempt = 0;
	_highestAcceptedResumeAttempt = 0;

	constructor(options: CreateRpcSessionContinuityOptions) {
		this._sessionId = options.sessionId;
		this._resumeToken = options.resumeToken;
		this._inspect = options.inspect;
		this._install = options.installBinding;
		this._onTerminate = options.onTerminate;
	}

	get host(): IRpcProtocolSessionHost | undefined {
		return this._sessionHost;
	}

	terminate(): void {
		this._resumeToken = undefined;
	}

	prepareFresh(host: IRpcProtocolSessionHost): IRpcBindingPlan {
		const state = this._inspect();
		const resumeToken = this._resumeToken;
		// Fresh binding is legal only for an open, unbound, never-recovered Session.
		const cannotPrepareFresh =
			state.closed ||
			resumeToken === undefined ||
			this._sessionHost !== undefined ||
			state.binding !== undefined ||
			this._bindingEpoch !== 0 ||
			state.recovering;
		if (cannotPrepareFresh) {
			throw new Error("Default RPC fresh binding plan is invalid.");
		}
		// Preserve provisional Topology admission so failed preparation can close it.
		this._sessionHost = host;
		return this._createBindingPlan({
			facts: this._snapshotCandidateFacts(),
			host,
			kind: "fresh",
			nextBindingEpoch: 1,
			peerReceivedThrough: 0,
		});
	}

	beginResume(): IRpcResumeAttempt {
		const state = this._inspect();
		const resumeToken = this._resumeToken;
		const recoveryDeadline = state.recoveryDeadline;
		// Resume requires live retained authority within the active recovery window.
		const sessionIsNotRecoverable =
			state.closed ||
			!state.recovering ||
			state.binding !== undefined ||
			resumeToken === undefined ||
			recoveryDeadline === undefined ||
			Date.now() >= recoveryDeadline;
		if (sessionIsNotRecoverable) {
			throw new Error("Default RPC Session is not recoverable.");
		}
		if (this._resumeAttempt >= Number.MAX_SAFE_INTEGER) {
			throw new Error("Default RPC resumeAttempt counter is exhausted.");
		}
		this._resumeAttempt += 1;
		const resumeAttempt = this._resumeAttempt;
		const facts: RpcResumeAttemptFacts = Object.freeze({
			facts: this._snapshotCandidateFacts(),
			resumeAttempt,
		});
		let reviewed = false;
		return Object.freeze<IRpcResumeAttempt>({
			sessionId: this._sessionId,
			token: resumeToken,
			attempt: resumeAttempt,
			cursor: state.receivedThrough,
			review: (outcome: RpcResumeOutcome): RpcResumeDecision => {
				if (reviewed) {
					return this._rejectResumeDecision(
						"Default RPC resume attempt is unknown or already consumed.",
					);
				}
				reviewed = true;
				return this._reviewResumeOutcome(facts, outcome);
			},
		});
	}

	reviewResume(claim: RpcResumeClaim): RpcResumeDecision {
		const resumeToken = this._resumeToken;
		// A responder resume must present current Session authority and a newer attempt.
		const responderAuthorityIsInvalid =
			resumeToken === undefined ||
			this._inspect().closed ||
			!rpcSecurityCarriersEqual(claim.token, resumeToken) ||
			!this._canAcceptResumeAttempt(claim.attempt);
		if (responderAuthorityIsInvalid) {
			return this._rejectResumeDecision(
				"Default RPC resume was generically rejected.",
			);
		}
		const facts = this._snapshotCandidateFacts();
		if (
			this._classifyPeerCursor(claim.cursor) !==
			RpcPeerCursorClassificationEnum.valid
		) {
			return Object.freeze({
				kind: "terminate",
				plan: this._createTerminationPlan(
					RpcCloseReasonEnum.continuityFailure,
					() =>
						this._candidateFactsCurrent(facts) &&
						this._canAcceptResumeAttempt(claim.attempt) &&
						this._classifyPeerCursor(claim.cursor) !==
							RpcPeerCursorClassificationEnum.valid,
				),
			});
		}
		const bindingEpoch = this._bindingEpoch + 1;
		return Object.freeze({
			kind: "bind",
			bindingEpoch,
			cursor: this._inspect().receivedThrough,
			plan: this._createBindingPlan({
				facts,
				kind: "responder-resume",
				nextBindingEpoch: bindingEpoch,
				peerReceivedThrough: claim.cursor,
				resumeAttempt: claim.attempt,
			}),
		});
	}

	_reviewResumeOutcome(
		resume: RpcResumeAttemptFacts,
		outcome: RpcResumeOutcome,
	): RpcResumeDecision {
		if (!this._initiatorResumeCurrent(resume)) {
			return this._rejectResumeDecision(
				"Default RPC initiator resume attempt became stale.",
			);
		}
		if (outcome.kind === "rejected") {
			return this._rejectResumeDecision(
				"Default RPC resume was generically rejected.",
			);
		}
		if (
			outcome.kind === "continuity-failure" ||
			outcome.kind === "terminated"
		) {
			const reason =
				outcome.kind === "continuity-failure"
					? RpcCloseReasonEnum.continuityFailure
					: RpcCloseReasonEnum.remoteTerminated;
			return Object.freeze({
				kind: "terminate",
				plan: this._createTerminationPlan(reason, () =>
					this._initiatorResumeCurrent(resume),
				),
			});
		}
		const contradictory =
			outcome.profile !== RPC_PROFILE ||
			outcome.sessionId !== this._sessionId ||
			!Number.isSafeInteger(outcome.bindingEpoch) ||
			outcome.bindingEpoch <= this._bindingEpoch ||
			this._classifyPeerCursor(outcome.cursor) !==
				RpcPeerCursorClassificationEnum.valid;
		if (contradictory) {
			return Object.freeze({
				kind: "terminate",
				plan: this._createTerminationPlan(
					RpcCloseReasonEnum.continuityFailure,
					() => this._initiatorResumeCurrent(resume),
				),
			});
		}
		return Object.freeze({
			kind: "bind",
			bindingEpoch: outcome.bindingEpoch,
			cursor: outcome.cursor,
			plan: this._createBindingPlan({
				facts: resume.facts,
				kind: "initiator-resume",
				nextBindingEpoch: outcome.bindingEpoch,
				peerReceivedThrough: outcome.cursor,
				resumeAttempt: resume.resumeAttempt,
			}),
		});
	}

	_rejectResumeDecision(message: string): RpcResumeDecision {
		return Object.freeze({ kind: "reject", error: new Error(message) });
	}

	_createBindingPlan(candidate: RpcBindingPlanFacts): IRpcBindingPlan {
		let consumed = false;
		return Object.freeze<IRpcBindingPlan>({
			install: (endpoint: IRpcEndpoint): IRpcSessionBinding => {
				if (consumed) {
					throw new Error(
						"Default RPC binding plan is unknown or already consumed.",
					);
				}
				consumed = true;
				return this._installBinding(candidate, endpoint);
			},
		});
	}

	_createTerminationPlan(
		reason:
			| RpcCloseReasonEnum.continuityFailure
			| RpcCloseReasonEnum.remoteTerminated,
		isCurrent: () => boolean,
	): IRpcSessionTerminationPlan {
		let consumed = false;
		return Object.freeze<IRpcSessionTerminationPlan>({
			commit: (cause?: Error): void => {
				if (consumed) {
					throw new Error(
						"Default RPC Session termination plan is unknown or already consumed.",
					);
				}
				consumed = true;
				if (!isCurrent()) {
					throw new Error("Default RPC Session termination plan became stale.");
				}
				this._onTerminate(reason, cause);
			},
		});
	}

	_snapshotCandidateFacts(): RpcSessionCandidateFacts {
		const state = this._inspect();
		return Object.freeze({
			binding: state.binding,
			bindingEpoch: this._bindingEpoch,
			highestSentSequence: state.highestSentSequence,
			peerReceivedThrough: state.peerReceivedThrough,
			receivedThrough: state.receivedThrough,
			recovering: state.recovering,
			recoveryDeadline: state.recoveryDeadline,
		});
	}

	_candidateFactsCurrent(facts: RpcSessionCandidateFacts): boolean {
		const state = this._inspect();
		return (
			!state.closed &&
			this._resumeToken !== undefined &&
			state.binding === facts.binding &&
			this._bindingEpoch === facts.bindingEpoch &&
			state.highestSentSequence === facts.highestSentSequence &&
			state.peerReceivedThrough === facts.peerReceivedThrough &&
			state.receivedThrough === facts.receivedThrough &&
			state.recovering === facts.recovering &&
			state.recoveryDeadline === facts.recoveryDeadline
		);
	}

	_initiatorRecoveryCurrent(facts: RpcSessionCandidateFacts): boolean {
		return (
			facts.recovering &&
			facts.binding === undefined &&
			facts.recoveryDeadline !== undefined &&
			Date.now() < facts.recoveryDeadline
		);
	}

	_initiatorResumeCurrent(candidate: RpcResumeAttemptFacts): boolean {
		return (
			candidate.resumeAttempt === this._resumeAttempt &&
			this._candidateFactsCurrent(candidate.facts) &&
			this._initiatorRecoveryCurrent(candidate.facts)
		);
	}

	_validateBindingPlan(
		candidate: RpcBindingPlanFacts,
		endpoint: IRpcEndpoint,
	): string | undefined {
		const state = this._inspect();
		if (!this._candidateFactsCurrent(candidate.facts)) {
			return "Default RPC binding plan became stale.";
		}
		if (state.binding?.endpoint === endpoint) {
			return "Default RPC binding plan reused its current Endpoint.";
		}
		// Binding continuity requires a safe newer epoch and a valid peer cursor.
		const continuityIsInvalid =
			!Number.isSafeInteger(candidate.nextBindingEpoch) ||
			candidate.nextBindingEpoch <= this._bindingEpoch ||
			this._classifyPeerCursor(candidate.peerReceivedThrough) !==
				RpcPeerCursorClassificationEnum.valid;
		if (continuityIsInvalid) {
			return "Default RPC binding plan contradicts retained continuity.";
		}
		if (candidate.kind === "fresh") {
			return this._sessionHost === candidate.host &&
				candidate.host !== undefined &&
				candidate.nextBindingEpoch === 1 &&
				candidate.peerReceivedThrough === 0 &&
				this._bindingEpoch === 0 &&
				state.binding === undefined &&
				!state.recovering
				? undefined
				: "Default RPC fresh binding plan became stale.";
		}
		if (candidate.kind === "initiator-resume") {
			return candidate.resumeAttempt === this._resumeAttempt &&
				this._initiatorRecoveryCurrent(candidate.facts)
				? undefined
				: "Default RPC initiator binding plan became stale.";
		}
		return candidate.resumeAttempt !== undefined &&
			this._canAcceptResumeAttempt(candidate.resumeAttempt) &&
			candidate.nextBindingEpoch === this._bindingEpoch + 1
			? undefined
			: "Default RPC responder binding plan became stale.";
	}

	_classifyPeerCursor(cursor: number): RpcPeerCursorClassificationEnum {
		const state = this._inspect();
		if (cursor < state.peerReceivedThrough) {
			return RpcPeerCursorClassificationEnum.lower;
		}
		if (cursor > state.highestSentSequence) {
			return RpcPeerCursorClassificationEnum.upper;
		}
		return RpcPeerCursorClassificationEnum.valid;
	}

	_canAcceptResumeAttempt(resumeAttempt: number): boolean {
		const state = this._inspect();
		return (
			Number.isSafeInteger(resumeAttempt) &&
			resumeAttempt > 0 &&
			!state.closed &&
			this._resumeToken !== undefined &&
			resumeAttempt > this._highestAcceptedResumeAttempt &&
			(!state.recovering ||
				state.binding !== undefined ||
				(state.recoveryDeadline !== undefined &&
					Date.now() < state.recoveryDeadline)) &&
			this._bindingEpoch < Number.MAX_SAFE_INTEGER
		);
	}

	_installBinding(
		prepared: RpcBindingPlanFacts,
		endpoint: IRpcEndpoint,
	): IRpcSessionBinding {
		const stale = this._validateBindingPlan(prepared, endpoint);
		if (stale !== undefined) throw new Error(stale);
		return this._install(
			endpoint,
			() => {
				if (prepared.kind === "fresh") this._sessionHost = prepared.host;
				if (prepared.kind === "responder-resume")
					this._highestAcceptedResumeAttempt = prepared.resumeAttempt as number;
				this._bindingEpoch = prepared.nextBindingEpoch;
			},
			prepared.peerReceivedThrough,
			prepared.kind === "responder-resume",
		);
	}
}

type RpcSessionCandidateFacts = Readonly<{
	readonly binding: IRpcSessionConnection | undefined;
	readonly bindingEpoch: number;
	readonly highestSentSequence: number;
	readonly peerReceivedThrough: number;
	readonly receivedThrough: number;
	readonly recovering: boolean;
	readonly recoveryDeadline: number | undefined;
}>;

type RpcBindingPlanFacts = Readonly<{
	readonly facts: RpcSessionCandidateFacts;
	readonly host?: IRpcProtocolSessionHost;
	readonly kind: "fresh" | "initiator-resume" | "responder-resume";
	readonly nextBindingEpoch: number;
	readonly peerReceivedThrough: number;
	readonly resumeAttempt?: number;
}>;

type RpcResumeAttemptFacts = Readonly<{
	readonly facts: RpcSessionCandidateFacts;
	readonly resumeAttempt: number;
}>;
