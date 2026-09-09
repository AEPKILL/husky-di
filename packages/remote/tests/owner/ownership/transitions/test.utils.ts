/**
 * @overview Shared owner/rpc-session-ownership fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { RpcPeerState } from "../../../../src/modules/peer";
import type { RpcProtocolSessionTransition } from "../../../../src/modules/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../../../src/modules/protocol";
import { RpcCloseOutcomeEnum } from "../../../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../../../src/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../../../src/shared/enums/rpc-state-status.enum";

export const validTransitionCases = [
	{
		name: "active connected to recovering",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
	},
	{
		name: "active recovering to recovered",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
	},
	{
		name: "active connected to counter draining",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "active recovering to counter draining",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "active recovering to recovery expiry",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
	},
	{
		name: "active counter draining to counter exhaustion",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "active connected to remote termination",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "active recovering to continuity failure",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.continuityFailure,
		},
	},
	{
		name: "owner draining graceful peer to remote termination",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "owner draining counter peer to counter exhaustion",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
] satisfies readonly TransitionCase[];

export const invalidTransitionCases = [
	{
		name: "repeats recovering",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
	},
	{
		name: "recovers a connected peer",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
	},
	{
		name: "counter drains an unbound peer",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.unbound },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "expires recovery from connected",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
	},
	{
		name: "exhausts counters before counter drain",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
	{
		name: "lets Protocol request graceful shutdown",
		ownerStatus: RpcStateStatusEnum.active,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
	},
	{
		name: "changes recovery while owner drains",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
	},
	{
		name: "closes a connected peer while owner drains",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
	},
	{
		name: "expires recovery while owner drains",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
	},
	{
		name: "exhausts a gracefully draining peer",
		ownerStatus: RpcStateStatusEnum.draining,
		peerState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		},
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
] satisfies readonly TransitionCase[];

export const nonterminalProjectionCases = [
	{
		name: "projects recovery",
		peerState: { status: RpcStateStatusEnum.connected },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovering },
		expectedState: { status: RpcStateStatusEnum.recovering },
		expectedEvent: { type: RpcEventTypeEnum.peerRecovering },
	},
	{
		name: "projects recovery completion",
		peerState: { status: RpcStateStatusEnum.recovering },
		transition: { type: RpcProtocolSessionTransitionTypeEnum.recovered },
		expectedState: { status: RpcStateStatusEnum.connected },
		expectedEvent: { type: RpcEventTypeEnum.peerRecovered },
	},
	{
		name: "projects counter drain",
		peerState: { status: RpcStateStatusEnum.connected },
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		expectedState: {
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		expectedEvent: {
			type: RpcEventTypeEnum.peerDraining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
	},
] as const;

export const terminalTransitionCases = [
	{
		name: "remote termination",
		prelude: [] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		},
		outcome: RpcCloseOutcomeEnum.normal,
		code: undefined,
	},
	{
		name: "recovery expiry",
		prelude: [
			{ type: RpcProtocolSessionTransitionTypeEnum.recovering },
		] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		},
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.unavailable,
	},
	{
		name: "counter exhaustion",
		prelude: [
			{
				type: RpcProtocolSessionTransitionTypeEnum.draining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			},
		] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.counterExhaustion,
		},
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.unavailable,
	},
	{
		name: "continuity failure",
		prelude: [] as const,
		transition: {
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.continuityFailure,
		},
		outcome: RpcCloseOutcomeEnum.failed,
		code: RpcExceptionCodeEnum.protocol,
	},
] satisfies readonly Readonly<{
	name: string;
	prelude: readonly RpcProtocolSessionTransition[];
	transition: RpcProtocolSessionTransition;
	outcome: RpcCloseOutcomeEnum;
	code: RpcExceptionCodeEnum | undefined;
}>[];

type SessionOwnerStatus =
	| RpcStateStatusEnum.active
	| RpcStateStatusEnum.draining;

type TransitionCase = Readonly<{
	readonly name: string;
	readonly ownerStatus: SessionOwnerStatus;
	readonly peerState: RpcPeerState;
	readonly transition: RpcProtocolSessionTransition;
}>;
