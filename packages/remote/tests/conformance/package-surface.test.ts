/**
 * @overview Published RPC Protocol, Transport, and conformance entry point tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";

import packageManifest from "../../package.json";
import type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcAdapterConformanceRemote,
	IRpcConnectorAdapterConformanceFixture,
	IRpcProtocolConformanceFixture,
	RpcConformanceCaseResult,
	RpcConformanceFailure,
	RpcConformanceOptions,
	RpcConformanceReport,
} from "../../src/conformance";
import * as conformance from "../../src/conformance";
import { createMemoryProtocolFixture } from "./test.utils";

const structuralRemote = {
	async sendToAdapter(_message: Uint8Array): Promise<void> {},
	async receiveFromAdapter(): Promise<Uint8Array> {
		return new Uint8Array();
	},
	async setAdapterSendBlocked(_blocked: boolean): Promise<void> {},
	async closeFromRemote(): Promise<void> {},
	async failFromRemote(_error: Error): Promise<void> {},
	isAdapterClosed: () => false,
	async waitForAdapterClose(): Promise<void> {},
} satisfies IRpcAdapterConformanceRemote;
const structuralProtocolFixture: IRpcProtocolConformanceFixture =
	createMemoryProtocolFixture();
const structuralConnectorFixture = {
	async create() {
		throw new Error("compile-time fixture only");
	},
} satisfies IRpcConnectorAdapterConformanceFixture;
const structuralAcceptorFixture = {
	async create() {
		throw new Error("compile-time fixture only");
	},
} satisfies IRpcAcceptorAdapterConformanceFixture;
const structuralReport: RpcConformanceReport = (
	_result: RpcConformanceCaseResult,
) => {};
const structuralOptions: RpcConformanceOptions = { report: structuralReport };
const structuralFailure = Object.assign(new Error("failure"), {
	caseId: "plain.string.case-id",
}) satisfies RpcConformanceFailure;

void structuralRemote;
void structuralProtocolFixture;
void structuralConnectorFixture;
void structuralAcceptorFixture;
void structuralOptions;
void structuralFailure;

describe("RPC conformance package surface", () => {
	it("RPC-PKG-009 exports exactly the three conformance runtime runners", () => {
		expect(Object.keys(conformance).sort()).toEqual([
			"runRpcAcceptorAdapterConformance",
			"runRpcConnectorAdapterConformance",
			"runRpcProtocolConformance",
		]);
	});

	it("RPC-PKG-004/008/009 publishes closed code and wire entries", () => {
		expect(Object.keys(packageManifest.exports).sort()).toEqual([
			".",
			"./conformance",
			"./protocol",
			"./transport",
			"./wire/husky-di-rpc-1/schema",
			"./wire/husky-di-rpc-1/security-vectors",
			"./wire/husky-di-rpc-1/transcripts",
			"./wire/husky-di-rpc-1/vectors",
		]);
		expect(packageManifest.exports).toMatchObject({
			"./protocol": {
				types: "./dist/protocol.d.ts",
				import: "./dist/protocol.js",
				require: "./dist/protocol.cjs",
			},
			"./transport": {
				types: "./dist/transport.d.ts",
				import: "./dist/transport.js",
				require: "./dist/transport.cjs",
			},
			"./conformance": {
				types: "./dist/conformance.d.ts",
				import: "./dist/conformance.js",
				require: "./dist/conformance.cjs",
			},
			"./wire/husky-di-rpc-1/schema": "./wire/husky-di-rpc-1/schema.json",
			"./wire/husky-di-rpc-1/vectors": "./wire/husky-di-rpc-1/raw-vectors.json",
			"./wire/husky-di-rpc-1/transcripts":
				"./wire/husky-di-rpc-1/transcripts.json",
			"./wire/husky-di-rpc-1/security-vectors":
				"./wire/husky-di-rpc-1/known-answer-vectors.json",
		});
	});
});
