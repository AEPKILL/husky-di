/**
 * @overview Internal decoded-record grammar and raw-byte Codec verification.
 * @author AEPKILL
 * @created 2026-08-26 11:44:17
 */

import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { RPC_PROFILE } from "../../src/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "../../src/enums/protocol/rpc-decode-phase.enum";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";

type RecordCase = readonly [
	label: string,
	phase: RpcDecodePhaseEnum,
	record: Readonly<Record<string, unknown>>,
];

const codec = new RpcCodecImpl();
const encoder = new TextEncoder();
const base64Url32 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function encodeRecord(record: Readonly<Record<string, unknown>>): Uint8Array {
	return encoder.encode(JSON.stringify(record));
}

function decodeRecord(
	record: Readonly<Record<string, unknown>>,
	phase: RpcDecodePhaseEnum,
): Readonly<Record<string, unknown>> {
	return codec.decode(encodeRecord(record), phase) as Readonly<
		Record<string, unknown>
	>;
}

function expectPlainCodecError(operation: () => unknown): Error {
	let failure: unknown;
	try {
		operation();
	} catch (error) {
		failure = error;
	}

	expect(failure).toBeInstanceOf(Error);
	expect(failure).not.toBeInstanceOf(ZodError);
	return failure as Error;
}

const validRecordCases = [
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

const invalidRecordCases = [
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

describe("Default RPC Codec Zod grammar", () => {
	it.each(
		validRecordCases,
	)("RPC-CORPUS-001 RPC-WIRE-005 RPC-WIRE-006 RPC-WIRE-007 RPC-WIRE-008 RPC-WIRE-009 RPC-WIRE-010 RPC-WIRE-011 RPC-WIRE-012 RPC-WIRE-013 RPC-WIRE-014 RPC-WIRE-015 accepts the %s Zod branch and preserves open tails RPC-PKG-004", (_label, phase, record) => {
		expect(decodeRecord(record, phase)).toEqual(record);
	});

	it.each(
		invalidRecordCases,
	)("RPC-CORPUS-001 RPC-WIRE-004 RPC-WIRE-007 RPC-WIRE-008 RPC-WIRE-009 RPC-WIRE-010 RPC-WIRE-011 RPC-WIRE-012 RPC-VALID-001 RPC-VALID-005 RPC-VALID-007 rejects %s without leaking ZodError RPC-PKG-004", (_label, phase, record) => {
		expectPlainCodecError(() => decodeRecord(record, phase));
	});

	it.each([
		"seq",
		"ackThrough",
		"profile",
		"profiles",
		"sessionId",
		"bindingEpoch",
		"resumeAttempt",
		"receivedThrough",
		"resumeToken",
		"callId",
		"service",
		"method",
		"args",
		"value",
		"error",
		"code",
		"message",
		"reason",
	] as const)("RPC-CORPUS-001 RPC-WIRE-015 rejects Close carrying the known %s field", (field) => {
		const failure = expectPlainCodecError(() =>
			decodeRecord({ kind: "close", [field]: null }, RpcDecodePhaseEnum.active),
		);

		expect(failure.message).toBe(
			"RPC close contains a forbidden control member.",
		);
	});

	it("RPC-CORPUS-001 RPC-WIRE-005 preserves own __proto__ open tails after Zod validation", () => {
		const decoded = codec.decode(
			encoder.encode(
				'{"kind":"message","seq":1,"__proto__":{"marker":"top-kept"},"message":{"kind":"call","callId":"1","service":"service","method":"run","args":[{"__proto__":"application-data"}],"__proto__":{"marker":"nested-kept"}}}',
			),
			RpcDecodePhaseEnum.active,
		) as Readonly<Record<string, unknown>>;
		const message = decoded.message as Readonly<Record<string, unknown>>;
		const args = message.args as readonly Readonly<Record<string, unknown>>[];

		expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
		expect(Reflect.get(decoded, "__proto__")).toEqual({ marker: "top-kept" });
		expect(Object.hasOwn(message, "__proto__")).toBe(true);
		expect(Reflect.get(message, "__proto__")).toEqual({
			marker: "nested-kept",
		});
		expect(Object.hasOwn(args[0] as object, "__proto__")).toBe(true);
	});

	it("RPC-CORPUS-001 RPC-WIRE-005 RPC-WIRE-012 closes the untagged Error payload after Zod validation", () => {
		const failure = expectPlainCodecError(() =>
			codec.decode(
				encoder.encode(
					'{"kind":"message","seq":1,"message":{"kind":"error","callId":"1","error":{"code":"handler-failed","message":"failed","stack":"secret"}}}',
				),
				RpcDecodePhaseEnum.active,
			),
		);

		expect(failure.message).toBe(
			"RPC error payload contains an unknown member.",
		);
	});

	it("RPC-CORPUS-001 RPC-WIRE-004 RPC-WIRE-011 distinguishes absent void from a present null result", () => {
		const voidRecord = decodeRecord(
			{
				kind: "message",
				seq: 1,
				message: { kind: "result", callId: "1" },
			},
			RpcDecodePhaseEnum.active,
		);
		const nullRecord = decodeRecord(
			{
				kind: "message",
				seq: 2,
				message: { kind: "result", callId: "2", value: null },
			},
			RpcDecodePhaseEnum.active,
		);
		const voidResult = voidRecord.message as Readonly<Record<string, unknown>>;
		const nullResult = nullRecord.message as Readonly<Record<string, unknown>>;

		expect(Object.hasOwn(voidResult, "value")).toBe(false);
		expect(Object.hasOwn(nullResult, "value")).toBe(true);
		expect(nullResult.value).toBeNull();
	});
});

describe("Default RPC Codec raw parser", () => {
	it("RPC-CORPUS-001 RPC-WIRE-003 accepts legal whitespace, member order, and equivalent escapes", () => {
		const record = codec.decode(
			encoder.encode(
				' \n { "future" : true , "\\u006b\\u0069\\u006e\\u0064" : "ping" } \r\t',
			),
			RpcDecodePhaseEnum.active,
		);

		expect(record).toMatchObject({ kind: "ping", future: true });
	});

	it("RPC-CORPUS-001 RPC-WIRE-002 RPC-WIRE-003 RPC-VALID-001 RPC-VALID-005 rejects malformed byte and JSON framing input before Zod validation", () => {
		const malformedUtf8 = Uint8Array.from([
			0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
		]);
		const leadingBom = Uint8Array.from([
			0xef,
			0xbb,
			0xbf,
			...encoder.encode('{"kind":"ping"}'),
		]);
		const cases = [
			malformedUtf8,
			leadingBom,
			encoder.encode('{"kind":"ping"}{"kind":"pong"}'),
			encoder.encode('{"kind":"ping"}x'),
			encoder.encode("[]"),
		];

		for (const bytes of cases) {
			expectPlainCodecError(() => codec.decode(bytes, RpcDecodePhaseEnum.json));
		}
	});

	it("RPC-CORPUS-001 RPC-WIRE-003 RPC-WIRE-005 RPC-VALID-001 RPC-VALID-005 rejects escaped duplicates and unpaired surrogates before materialization", () => {
		for (const source of [
			'{"kind":"ping","\\u006b\\u0069\\u006e\\u0064":"pong"}',
			'{"kind":"ping","future":"\\uD800"}',
		]) {
			expectPlainCodecError(() =>
				codec.decode(encoder.encode(source), RpcDecodePhaseEnum.json),
			);
		}
	});

	it("RPC-CORPUS-001 RPC-WIRE-004 RPC-VALID-001 RPC-VALID-005 rejects out-of-domain JSON numbers before Zod validation", () => {
		for (const source of [
			'{"kind":"ping","future":-0}',
			'{"kind":"ping","future":1e400}',
		]) {
			expectPlainCodecError(() =>
				codec.decode(encoder.encode(source), RpcDecodePhaseEnum.json),
			);
		}
	});
});
