/**
 * @overview Shared protocol/rpc-codec fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	RPC_PROFILE,
	RpcDecodePhaseEnum,
} from "../../../../src/modules/protocol";
import { base64Url32, type RecordCase } from "../test.utils";

export const invalidRecordCases = [
	[
		"an active record during bootstrap",
		RpcDecodePhaseEnum.bootstrapRequest,
		{ kind: "ping" },
	],
	[
		"an empty profile offer",
		RpcDecodePhaseEnum.bootstrapRequest,
		{ kind: "fresh", profiles: [] },
	],
	[
		"a duplicate profile offer",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "fresh",
			profiles: [RPC_PROFILE, RPC_PROFILE],
		},
	],
	[
		"an empty ProfileId",
		RpcDecodePhaseEnum.bootstrapRequest,
		{ kind: "fresh", profiles: [""] },
	],
	[
		"a padded resume token",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			resumeToken: `${base64Url32}=`,
			receivedThrough: 0,
			resumeAttempt: 1,
		},
	],
	[
		"a non-URL resume token",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			resumeToken: `+${base64Url32.slice(1)}`,
			receivedThrough: 0,
			resumeAttempt: 1,
		},
	],
	[
		"a short resume token",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			resumeToken: base64Url32.slice(1),
			receivedThrough: 0,
			resumeAttempt: 1,
		},
	],
	[
		"a missing resume token",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			receivedThrough: 0,
			resumeAttempt: 1,
		},
	],
	[
		"a negative resume cursor",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			resumeToken: base64Url32,
			receivedThrough: -1,
			resumeAttempt: 1,
		},
	],
	[
		"a zero resume attempt",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			resumeToken: base64Url32,
			receivedThrough: 0,
			resumeAttempt: 0,
		},
	],
	[
		"a reject during fresh accept",
		RpcDecodePhaseEnum.freshAccept,
		{ kind: "reject", code: "unsupported-profile" },
	],
	[
		"a fresh accept missing its resume token",
		RpcDecodePhaseEnum.freshAccept,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 1,
		},
	],
	[
		"a different fresh profile",
		RpcDecodePhaseEnum.freshAccept,
		{
			kind: "accept",
			profile: "future/2",
			sessionId: base64Url32,
			bindingEpoch: 1,
			resumeToken: base64Url32,
		},
	],
	[
		"a later fresh binding epoch",
		RpcDecodePhaseEnum.freshAccept,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 2,
			resumeToken: base64Url32,
		},
	],
	[
		"a fresh accept carrying a resume cursor",
		RpcDecodePhaseEnum.freshAccept,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 1,
			receivedThrough: 0,
			resumeToken: base64Url32,
		},
	],
	[
		"a fresh request during resume outcome",
		RpcDecodePhaseEnum.resumeOutcome,
		{ kind: "fresh", profiles: [RPC_PROFILE] },
	],
	[
		"a resume accept carrying a resume token",
		RpcDecodePhaseEnum.resumeOutcome,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 2,
			receivedThrough: 0,
			resumeToken: base64Url32,
		},
	],
	[
		"an unsafe resume cursor",
		RpcDecodePhaseEnum.resumeOutcome,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 2,
			receivedThrough: Number.MAX_SAFE_INTEGER + 1,
		},
	],
	[
		"an unknown resume rejection code",
		RpcDecodePhaseEnum.resumeOutcome,
		{
			kind: "reject",
			code: "future-reject",
		},
	],
	[
		"a resume reject carrying a message",
		RpcDecodePhaseEnum.resumeOutcome,
		{
			kind: "reject",
			code: "resume-rejected",
			message: "secret",
		},
	],
	[
		"a bootstrap record during the active phase",
		RpcDecodePhaseEnum.active,
		{ kind: "fresh", profiles: [RPC_PROFILE] },
	],
	[
		"an unknown active kind",
		RpcDecodePhaseEnum.active,
		{ kind: "future-kind" },
	],
	[
		"a zero sequence",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 0,
			message: { kind: "cancel", callId: "1" },
		},
	],
	[
		"an unsafe sequence",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: Number.MAX_SAFE_INTEGER + 1,
			message: { kind: "cancel", callId: "1" },
		},
	],
	[
		"a negative ACK cursor",
		RpcDecodePhaseEnum.active,
		{ kind: "ack", ackThrough: -1 },
	],
	[
		"a leading-zero Call Ordinal",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: { kind: "cancel", callId: "01" },
		},
	],
	[
		"an unsafe Call Ordinal",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: { kind: "cancel", callId: "9007199254740992" },
		},
	],
	[
		"an empty service identifier",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "",
				method: "run",
				args: [],
			},
		},
	],
	[
		"an overlong method identifier",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "service",
				method: "界".repeat(86),
				args: [],
			},
		},
	],
	[
		"the reserved then method",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "service",
				method: "then",
				args: [],
			},
		},
	],
	[
		"non-array call arguments",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "service",
				method: "run",
				args: {},
			},
		},
	],
	[
		"an unknown semantic message kind",
		RpcDecodePhaseEnum.active,
		{ kind: "message", seq: 1, message: { kind: "future" } },
	],
	[
		"a local-only error code",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: {
				kind: "error",
				callId: "1",
				error: { code: "outcome-unknown", message: "unknown" },
			},
		},
	],
	[
		"an error payload missing its message",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			message: {
				kind: "error",
				callId: "1",
				error: { code: "handler-failed" },
			},
		},
	],
] satisfies readonly RecordCase[];
