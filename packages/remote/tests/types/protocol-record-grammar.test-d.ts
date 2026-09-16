/**
 * @overview Compile-time readonly probes for Zod-derived Protocol record types.
 * @author AEPKILL
 * @created 2026-08-26 15:07:19 11:36:44
 */

import { test } from "vitest";

import type {
	RpcCallMessage,
	RpcFreshAccept,
	RpcFreshRequest,
	RpcMessageEnvelope,
} from "../../src/modules/protocol";

test("RPC-PKG-004 keeps Zod-derived Protocol records readonly", () => {
	const freshAccept = null as unknown as RpcFreshAccept;
	const freshRequest = null as unknown as RpcFreshRequest;
	const messageEnvelope = null as unknown as RpcMessageEnvelope;
	const call = null as unknown as RpcCallMessage;

	// @ts-expect-error RPC-PKG-004 keeps Zod-derived record fields readonly.
	freshAccept.resumeToken = "changed";
	// @ts-expect-error RPC-PKG-004 keeps Zod-derived array fields readonly.
	freshRequest.profiles.push("future/2");
	// @ts-expect-error RPC-PKG-004 keeps nested Zod-derived record fields readonly.
	messageEnvelope.message.callId = "2";
	if (call.metadata !== undefined) {
		// @ts-expect-error Call Metadata remains a readonly application record.
		call.metadata.traceId = "changed";
	}
});
