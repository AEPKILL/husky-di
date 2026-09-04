/**
 * @overview Compile-time private Protocol implementation export probe.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { test } from "vitest";
import type * as PublicRemote from "../../src/index";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolIncomingCallReservation,
} from "../../src/protocol";

test("RPC-PKG-003 keeps the built-in Protocol private", () => {
	// @ts-expect-error RPC-PKG-003 keeps the built-in Protocol private.
	type MissingRpcProtocolImpl = import("../../src/index").RpcProtocolImpl;
	void (null as unknown as MissingRpcProtocolImpl);

	// @ts-expect-error RPC-PKG-003 keeps the built-in Connector role private.
	type MissingConnectorRole = PublicRemote.RpcProtocolConnectorImpl;
	void (null as unknown as MissingConnectorRole);

	// @ts-expect-error RPC-PKG-003 keeps the built-in Acceptor role private.
	type MissingAcceptorRole = PublicRemote.RpcProtocolAcceptorImpl;
	void (null as unknown as MissingAcceptorRole);
});

test("RPC-PKG-008 RPC-SPI-006 exposes only atomic prepare and scoped incoming call phases", () => {
	const request = null as unknown as IRpcProtocolCallRequest;
	const session = null as unknown as IRpcProtocolSession;
	const host = null as unknown as IRpcProtocolSessionHost;
	const reservation = null as unknown as RpcProtocolIncomingCallReservation;

	void session.prepareInvocation(request, () => undefined);
	void host.reserveIncomingCall(request, (offered) => {
		void offered.commit();
		return undefined;
	});
	// @ts-expect-error The consume scope is synchronous and cannot return a Promise.
	void host.reserveIncomingCall(request, async (offered) => {
		void offered.commit();
	});
	// @ts-expect-error Incoming reservations are flattened tagged capabilities.
	void reservation.reservation;
	// @ts-expect-error Incoming reservations have no caller-owned release phase.
	void reservation.release;
	// @ts-expect-error Outgoing reservation is folded into atomic preparation.
	void session.reserveInvocation;

	type MissingInvocationRequest =
		// @ts-expect-error The two request roles share IRpcProtocolCallRequest.
		import("../../src/protocol").IRpcProtocolInvocationRequest;
	void (null as unknown as MissingInvocationRequest);
	type MissingIncomingRequest =
		// @ts-expect-error The two request roles share IRpcProtocolCallRequest.
		import("../../src/protocol").IRpcProtocolIncomingCallRequest;
	void (null as unknown as MissingIncomingRequest);
	type MissingInvocationSink =
		// @ts-expect-error Finish is passed directly to prepareInvocation().
		import("../../src/protocol").IRpcProtocolInvocationSink;
	void (null as unknown as MissingInvocationSink);
	type MissingInvocationReservation =
		// @ts-expect-error Outgoing reservation is folded into preparation.
		import("../../src/protocol").IRpcProtocolInvocationReservation;
	void (null as unknown as MissingInvocationReservation);
	type MissingGenericIncomingReservation =
		// @ts-expect-error Incoming reservation is a flattened tagged union.
		import("../../src/protocol").IRpcProtocolIncomingCallReservation;
	void (null as unknown as MissingGenericIncomingReservation);
});
