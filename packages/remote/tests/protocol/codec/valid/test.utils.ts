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

export const validRecordCases = [
	[
		"fresh request",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "fresh",
			profiles: ["future/2", RPC_PROFILE],
			future: { marker: "nested-kept" },
		},
	],
	[
		"resume request",
		RpcDecodePhaseEnum.bootstrapRequest,
		{
			kind: "resume",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			resumeToken: base64Url32,
			receivedThrough: 0,
			resumeAttempt: 1,
			future: true,
		},
	],
	[
		"fresh accept",
		RpcDecodePhaseEnum.freshAccept,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 1,
			resumeToken: base64Url32,
			future: ["kept"],
		},
	],
	[
		"resume accept",
		RpcDecodePhaseEnum.resumeOutcome,
		{
			kind: "accept",
			profile: RPC_PROFILE,
			sessionId: base64Url32,
			bindingEpoch: 2,
			receivedThrough: 0,
			future: false,
		},
	],
	[
		"resume reject",
		RpcDecodePhaseEnum.resumeOutcome,
		{
			kind: "reject",
			code: "resume-rejected",
		},
	],
	[
		"call",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 1,
			futureEnvelope: null,
			message: {
				kind: "call",
				callId: "1",
				service: "calculator",
				method: "add",
				args: [1, 2, { marker: "application-data" }],
				futureMessage: true,
			},
		},
	],
	[
		"cancel",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 2,
			ackThrough: 1,
			message: { kind: "cancel", callId: "1" },
		},
	],
	[
		"void result",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 3,
			message: { kind: "result", callId: "1" },
		},
	],
	[
		"null result",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 4,
			message: { kind: "result", callId: "2", value: null },
		},
	],
	[
		"error",
		RpcDecodePhaseEnum.active,
		{
			kind: "message",
			seq: 5,
			message: {
				kind: "error",
				callId: "2",
				error: {
					code: "handler-failed",
					message: "failed",
					details: { retryable: false },
				},
			},
		},
	],
	["zero ACK", RpcDecodePhaseEnum.active, { kind: "ack", ackThrough: 0 }],
	["Ping", RpcDecodePhaseEnum.active, { kind: "ping", future: true }],
	["Pong", RpcDecodePhaseEnum.active, { kind: "pong" }],
	["Close", RpcDecodePhaseEnum.active, { kind: "close" }],
] satisfies readonly RecordCase[];
