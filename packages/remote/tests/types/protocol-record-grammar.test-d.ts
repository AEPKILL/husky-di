/**
 * @overview Compile-time readonly probes for Zod-derived Protocol record types.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { test } from "vitest";

import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcMessageEnvelope,
} from "../../src/types/protocol/rpc-wire-record.type";

test("RPC-PKG-004 keeps Zod-derived Protocol records readonly", () => {
	const freshAccept = null as unknown as RpcFreshAccept;
	const freshRequest = null as unknown as RpcFreshRequest;
	const messageEnvelope = null as unknown as RpcMessageEnvelope;

	// @ts-expect-error RPC-PKG-004 keeps Zod-derived record fields readonly.
	freshAccept.resumeToken = "changed";
	// @ts-expect-error RPC-PKG-004 keeps Zod-derived array fields readonly.
	freshRequest.profiles.push("future/2");
	// @ts-expect-error RPC-PKG-004 keeps nested Zod-derived record fields readonly.
	messageEnvelope.message.callId = "2";
});
