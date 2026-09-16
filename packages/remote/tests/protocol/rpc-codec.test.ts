/**
 * @overview Verifies rpc codec.
 * @author AEPKILL
 * @created 2026-08-26 14:52:37 11:44:17
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import {
	RPC_PROFILE,
	RpcCodecImpl,
	RpcDecodePhaseEnum,
} from "../../src/modules/protocol";
import { invalidRecordCases } from "./codec/invalid/test.utils";
import {
	codec,
	decodeRecord,
	encoder,
	expectPlainCodecError,
} from "./codec/test.utils";
import { validRecordCases } from "./codec/valid/test.utils";
import { createRpcTestNetwork } from "./test.utils";

describe("Default RPC Codec Zod grammar", () => {
	it("RPC-INTERCEPT-005 RPC-WIRE-011 preserves optional metadata records and their application keys", () => {
		const record = {
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "service",
				method: "run",
				args: [],
				metadata: JSON.parse(
					'{"traceId":"trace-1","kind":"app-data","__proto__":{"sampled":true},"nested":[null,1]}',
				),
			},
		};
		expect(decodeRecord(record, RpcDecodePhaseEnum.active)).toEqual(record);
	});

	it.each([
		["null", null],
		["array", []],
		["string", "trace-1"],
		["number", 1],
		["boolean", true],
		["oversized nested value", { traceId: "x".repeat(524_289) }],
	])("RPC-INTERCEPT-005 RPC-WIRE-011 rejects metadata outside the Application Value record domain: %s", (_label, metadata) => {
		expectPlainCodecError(() =>
			decodeRecord(
				{
					kind: "message",
					seq: 1,
					message: {
						kind: "call",
						callId: "1",
						service: "service",
						method: "run",
						args: [],
						metadata,
					},
				},
				RpcDecodePhaseEnum.active,
			),
		);
	});

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
		"metadata",
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

describe("RPC/2 stream wire grammar", () => {
	it("RPC-STREAM-003 accepts stream records with independent stream identity", () => {
		const streamCodec = new RpcCodecImpl(RPC_PROFILE);
		const records = [
			{
				kind: "message",
				seq: 1,
				message: {
					kind: "stream-open",
					streamId: "1",
					service: "service",
					member: "ticks",
					args: [],
				},
			},
			{
				kind: "message",
				seq: 2,
				message: { kind: "stream-next", streamId: "1", value: 1 },
			},
			{
				kind: "message",
				seq: 3,
				message: { kind: "stream-complete", streamId: "1" },
			},
			{
				kind: "message",
				seq: 4,
				message: {
					kind: "stream-error",
					streamId: "2",
					error: { code: "handler-failed", message: "failed" },
				},
			},
			{
				kind: "message",
				seq: 5,
				message: { kind: "stream-cancel", streamId: "2" },
			},
		] as const;
		for (const record of records) {
			expect(
				streamCodec.decode(
					encoder.encode(JSON.stringify(record)),
					RpcDecodePhaseEnum.active,
				),
			).toEqual(record);
		}
	});

	it("RPC-STREAM-010 rejects stream kinds in the RPC/1 codec", () => {
		const record = {
			kind: "message",
			seq: 1,
			message: { kind: "stream-next", streamId: "1", value: "tick" },
		};
		expect(() =>
			new RpcCodecImpl("husky-di-rpc/1").decode(
				encoder.encode(JSON.stringify(record)),
				RpcDecodePhaseEnum.active,
			),
		).toThrow();
	});
});

describe("profile negotiation", () => {
	it("RPC-STREAM-010 negotiates unary RPC/1 and refuses streams before sending an unknown record", async () => {
		const descriptor = createRemoteServiceDescriptor(
			createServiceIdentifier<{ run(): number; ticks(): Observable<number> }>(
				"ILegacyProfile",
			),
			{
				wireName: "legacy-profile",
				members: {
					run: { kind: "function" },
					ticks: { kind: "observable-function" },
				},
			},
		);
		const network = createRpcTestNetwork();
		network.setInterceptor((record) =>
			record.value.kind === "fresh"
				? {
						message: encoder.encode(
							JSON.stringify({ kind: "fresh", profiles: ["husky-di-rpc/1"] }),
						),
					}
				: undefined,
		);
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const ticks = vi.fn(() => of(1));
		acceptor.expose(descriptor, { run: () => 42, ticks });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const remote = connector.peer.resolve(descriptor);
		await expect(remote.run()).resolves.toBe(42);
		await expect(lastValueFrom(remote.ticks())).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(ticks).not.toHaveBeenCalled();
		expect(
			network.records.find((record) => record.value.kind === "accept")?.value
				.profile,
		).toBe("husky-di-rpc/1");
		expect(
			network.records.some(
				(record) =>
					record.value.kind === "message" &&
					String((record.value.message as { kind: string }).kind).startsWith(
						"stream-",
					),
			),
		).toBe(false);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it.each([
		"0",
		"01",
		"-1",
		"1.0",
		"9007199254740992",
	])("RPC-STREAM-003 rejects a noncanonical stream identity %s", (streamId) => {
		expectPlainCodecError(() =>
			decodeRecord(
				{
					kind: "message",
					seq: 1,
					message: {
						kind: "stream-open",
						streamId,
						service: "s",
						member: "ticks",
						args: [],
					},
				},
				RpcDecodePhaseEnum.active,
			),
		);
	});
});
