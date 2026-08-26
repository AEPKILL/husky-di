/**
 * @overview Compile-time private Protocol implementation export probe.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { test } from "vitest";
import type * as PublicRemote from "../../src/index";

test("RPC-PKG-003 keeps the built-in Protocol private", () => {
	// @ts-expect-error RPC-PKG-003 keeps the built-in Protocol private.
	type MissingRpcProtocolImpl = import("../../src/index").RpcProtocolImpl;
	void (null as unknown as MissingRpcProtocolImpl);

	// @ts-expect-error RPC-PKG-003 keeps the built-in Connector runtime private.
	type MissingConnectorRuntime = PublicRemote.RpcProtocolConnectorRuntimeImpl;
	void (null as unknown as MissingConnectorRuntime);

	// @ts-expect-error RPC-PKG-003 keeps the built-in Acceptor runtime private.
	type MissingAcceptorRuntime = PublicRemote.RpcProtocolAcceptorRuntimeImpl;
	void (null as unknown as MissingAcceptorRuntime);
});
