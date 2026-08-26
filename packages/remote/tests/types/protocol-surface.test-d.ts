/**
 * @overview Compile-time private Protocol implementation export probe.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { test } from "vitest";

test("RPC-PKG-003 keeps the built-in Protocol private", () => {
	// @ts-expect-error RPC-PKG-003 keeps the built-in Protocol private.
	type MissingRpcProtocolImpl = import("../../src/index").RpcProtocolImpl;
	void (null as unknown as MissingRpcProtocolImpl);
});
