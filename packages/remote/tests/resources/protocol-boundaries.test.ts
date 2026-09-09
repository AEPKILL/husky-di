/**
 * @overview Verifies protocol boundaries.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";
import type { RpcJsonValue } from "../../src/modules/protocol";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RPC_MAX_WIRE_DEPTH,
	RPC_MAX_WIRE_NODES,
	RpcDecodePhaseEnum,
	RpcWireRecordKindEnum,
} from "../../src/modules/protocol";
import {
	codec,
	createApplicationArgumentsWithNodes,
	createApplicationMessages,
	createApplicationRecordWithNodes,
	createNestedApplicationValue,
	createNodeBoundaryJson,
	decodeJson,
	encoder,
	mebibyte,
} from "./boundaries/test.utils";

describe("Default RPC Protocol resource boundaries", () => {
	it("RPC-WIRE-003 rejects reserved-looking unknown Error payload members", () => {
		const source =
			'{"kind":"message","seq":1,"message":{"kind":"error","callId":"1","error":{"code":"canceled","message":"failed","__proto__":0}}}';

		expect(() =>
			codec.decode(encoder.encode(source), RpcDecodePhaseEnum.active),
		).toThrow("RPC error payload contains an unknown member.");
	});

	it("RPC-VALUE-004 RPC-WIRE-003 round-trips Application Value depth and node boundaries through active envelopes", () => {
		const boundaryCases = [
			{
				name: "depth 64",
				args: normalizeRpcApplicationArguments(createNestedApplicationValue(64))
					.value,
				value: normalizeRpcApplicationValue(createNestedApplicationValue(64))
					.value,
			},
			{
				name: "nodes 65536",
				args: normalizeRpcApplicationArguments(
					createApplicationArgumentsWithNodes(65_536),
				).value,
				value: normalizeRpcApplicationValue(
					createApplicationRecordWithNodes(65_536),
				).value,
			},
		];

		for (const boundary of boundaryCases) {
			for (const message of createApplicationMessages(
				boundary.args,
				boundary.value,
			)) {
				const envelope = {
					kind: RpcWireRecordKindEnum.message,
					seq: 1,
					ackThrough: 0,
					message,
				};
				expect(
					() => codec.decode(codec.encode(envelope), RpcDecodePhaseEnum.active),
					`${boundary.name} ${String(message.kind)}`,
				).not.toThrow();
			}
		}
	});

	it("RPC-VALUE-004 RPC-WIRE-003 rejects Application Values beyond their local depth and node boundaries", () => {
		const beyondBoundaryCases = [
			{
				name: "depth 65",
				args: createNestedApplicationValue(65) as readonly RpcJsonValue[],
				value: createNestedApplicationValue(65),
			},
			{
				name: "nodes 65537",
				args: createApplicationArgumentsWithNodes(65_537),
				value: createApplicationRecordWithNodes(65_537),
			},
		];

		for (const boundary of beyondBoundaryCases) {
			for (const message of createApplicationMessages(
				boundary.args,
				boundary.value,
			)) {
				expect(
					() =>
						codec.decode(
							codec.encode({
								kind: RpcWireRecordKindEnum.message,
								seq: 1,
								message,
							}),
							RpcDecodePhaseEnum.active,
						),
					`${boundary.name} ${String(message.kind)}`,
				).toThrow();
			}
		}
	});

	it("RPC-CORPUS-004 executes limit-1, limit, and limit+1 for every fixed Codec allocation boundary RPC-CORPUS-001", () => {
		const objectWithMembers = (members: number) =>
			`{"kind":"ping","future":{${Array.from(
				{ length: members },
				(_, index) => `"k${index}":null`,
			).join(",")}}}`;
		const arrayWithElements = (elements: number) =>
			`{"kind":"ping","future":[${"null,".repeat(elements - 1)}null]}`;
		const boundaries = [
			{
				name: `wire depth ${RPC_MAX_WIRE_DEPTH}`,
				create: (value: number) =>
					`{"kind":"ping","future":${"[".repeat(value - 2)}null${"]".repeat(value - 2)}}`,
				limit: RPC_MAX_WIRE_DEPTH,
			},
			{
				name: "string UTF-8 bytes 524288",
				create: (value: number) =>
					`{"kind":"ping","future":"${"a".repeat(value)}"}`,
				limit: 524_288,
			},
			{
				name: "member-name UTF-8 bytes 256",
				create: (value: number) =>
					`{"kind":"ping","${"a".repeat(value)}":null}`,
				limit: 256,
			},
			{
				name: "object members 1024",
				create: objectWithMembers,
				limit: 1024,
			},
			{
				name: "array elements 8192",
				create: arrayWithElements,
				limit: 8192,
			},
			{
				name: `wire JSON nodes ${RPC_MAX_WIRE_NODES}`,
				create: createNodeBoundaryJson,
				limit: RPC_MAX_WIRE_NODES,
			},
		];

		for (const boundary of boundaries) {
			expect(
				() => decodeJson(boundary.create(boundary.limit - 1)),
				`${boundary.name} limit-1`,
			).not.toThrow();
			expect(
				() => decodeJson(boundary.create(boundary.limit)),
				`${boundary.name} limit`,
			).not.toThrow();
			expect(
				() => decodeJson(boundary.create(boundary.limit + 1)),
				`${boundary.name} limit+1`,
			).toThrow();
		}

		const base = '{"kind":"ping"}';
		const messageAt = (bytes: number) =>
			base + " ".repeat(bytes - encoder.encode(base).byteLength);
		expect(
			() => decodeJson(messageAt(mebibyte - 1)),
			"Transport message bytes limit-1",
		).not.toThrow();
		expect(
			() => decodeJson(messageAt(mebibyte)),
			"Transport message bytes limit",
		).not.toThrow();
		expect(
			() => decodeJson(messageAt(mebibyte + 1)),
			"Transport message bytes limit+1",
		).toThrow();
	});
});
