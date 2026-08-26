/**
 * @overview Compile-time caller and Framework boundary probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { test } from "vitest";

test("RPC-BASE-003 keeps the Codec interface private", () => {
	// @ts-expect-error RPC-BASE-003 keeps the Codec interface private.
	type MissingRpcCodec = import("../../src/protocol").IRpcCodec;
	void (null as unknown as MissingRpcCodec);
});

test("RPC-POLICY-004 keeps the internal scheduler private", () => {
	// @ts-expect-error RPC-POLICY-004 keeps the internal scheduler private.
	type MissingRpcScheduler = import("../../src/index").RpcHandlerSchedulerImpl;
	void (null as unknown as MissingRpcScheduler);
});
