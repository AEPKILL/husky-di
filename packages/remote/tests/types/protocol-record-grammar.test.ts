/**
 * @overview Compile-time readonly probes for Zod-derived Protocol record types.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import type {
	RpcFreshRequest,
	RpcMessageEnvelope,
} from "../../src/types/protocol/rpc-wire-record.type";

declare const freshRequest: RpcFreshRequest;
declare const messageEnvelope: RpcMessageEnvelope;

// @ts-expect-error RPC-PKG-004 keeps Zod-derived record fields readonly.
freshRequest.initiatorNonce = "changed";
// @ts-expect-error RPC-PKG-004 keeps Zod-derived array fields readonly.
freshRequest.profiles.push("future/2");
// @ts-expect-error RPC-PKG-004 keeps nested Zod-derived record fields readonly.
messageEnvelope.message.callId = "2";
