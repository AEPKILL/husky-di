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

	// @ts-expect-error Framework call lifecycle is a private collaborator.
	type MissingCallLifecycle = PublicRemote.IRpcPeerCallLifecycle;
	void (null as unknown as MissingCallLifecycle);

	type MissingCallLifecycleFactory =
		// @ts-expect-error The Protocol extension surface does not expose Framework assembly.
		import("../../src/protocol").RpcPeerCallLifecycleFactory;
	void (null as unknown as MissingCallLifecycleFactory);

	// @ts-expect-error Framework call implementation remains private.
	type MissingCallLifecycleImpl = PublicRemote.RpcPeerCallLifecycleImpl;
	void (null as unknown as MissingCallLifecycleImpl);

	// @ts-expect-error Session retention is a private collaborator.
	type MissingCallRetention = PublicRemote.IRpcSessionCallRetention;
	void (null as unknown as MissingCallRetention);

	type MissingCallRetentionFactory =
		// @ts-expect-error Protocol extensions do not expose Default Protocol retention assembly.
		import("../../src/protocol").RpcSessionCallRetentionFactory;
	void (null as unknown as MissingCallRetentionFactory);

	// @ts-expect-error Default Protocol retention implementation remains private.
	type MissingCallRetentionImpl = PublicRemote.RpcSessionCallRetentionImpl;
	void (null as unknown as MissingCallRetentionImpl);

	// @ts-expect-error Activity Probe ownership is a private Session collaborator.
	type MissingSessionActivity = PublicRemote.IRpcSessionActivity;
	void (null as unknown as MissingSessionActivity);

	type MissingSessionActivityFactory =
		// @ts-expect-error Protocol extensions do not expose Activity Probe assembly.
		import("../../src/protocol").RpcSessionActivityFactory;
	void (null as unknown as MissingSessionActivityFactory);

	// @ts-expect-error Default Protocol Activity Probe implementation remains private.
	type MissingSessionActivityImpl = PublicRemote.RpcSessionActivityImpl;
	void (null as unknown as MissingSessionActivityImpl);

	// @ts-expect-error Outgoing Invocation ownership is a private Session collaborator.
	type MissingSessionInvocations = PublicRemote.IRpcSessionInvocations;
	void (null as unknown as MissingSessionInvocations);

	type MissingSessionInvocationsFactory =
		// @ts-expect-error Protocol extensions do not expose Invocation assembly.
		import("../../src/protocol").RpcSessionInvocationsFactory;
	void (null as unknown as MissingSessionInvocationsFactory);

	// @ts-expect-error Default Protocol Invocation implementation remains private.
	type MissingSessionInvocationsImpl = PublicRemote.RpcSessionInvocationsImpl;
	void (null as unknown as MissingSessionInvocationsImpl);

	// @ts-expect-error Incoming call ownership is a private Session collaborator.
	type MissingSessionIncomingCalls = PublicRemote.IRpcSessionIncomingCalls;
	void (null as unknown as MissingSessionIncomingCalls);

	type MissingSessionIncomingCallsFactory =
		// @ts-expect-error Protocol extensions do not expose incoming call assembly.
		import("../../src/protocol").RpcSessionIncomingCallsFactory;
	void (null as unknown as MissingSessionIncomingCallsFactory);

	type MissingSessionIncomingCallsImpl =
		// @ts-expect-error Default Protocol incoming call implementation remains private.
		PublicRemote.RpcSessionIncomingCallsImpl;
	void (null as unknown as MissingSessionIncomingCallsImpl);

	type MissingSessionFactory =
		// @ts-expect-error Default Protocol Session assembly remains private.
		import("../../src/protocol").RpcSessionFactory;
	void (null as unknown as MissingSessionFactory);
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

test("RPC-PKG-003 keeps Protocol case lifetime collaborators private on every entrypoint", () => {
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/index").IRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/index").IRpcProtocolCaseScope);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/index").RpcProtocolCaseLifetimeFactory);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/index").RpcProtocolCaseLifetimeImpl);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/index").ProtocolPair);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/index").ProtocolHostProbe);
	// @ts-expect-error Protocol case lifetime assembly is private.
	void (null as unknown as typeof import("../../src/index").createRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/protocol").IRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/protocol").IRpcProtocolCaseScope);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/protocol").RpcProtocolCaseLifetimeFactory);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/protocol").RpcProtocolCaseLifetimeImpl);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/protocol").ProtocolPair);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/protocol").ProtocolHostProbe);
	// @ts-expect-error Protocol case lifetime assembly is private.
	void (null as unknown as typeof import("../../src/protocol").createRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/transport").IRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/transport").IRpcProtocolCaseScope);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/transport").RpcProtocolCaseLifetimeFactory);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/transport").RpcProtocolCaseLifetimeImpl);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/transport").ProtocolPair);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/transport").ProtocolHostProbe);
	// @ts-expect-error Protocol case lifetime assembly is private.
	void (null as unknown as typeof import("../../src/transport").createRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/conformance").IRpcProtocolCaseLifetime);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/conformance").IRpcProtocolCaseScope);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/conformance").RpcProtocolCaseLifetimeFactory);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/conformance").RpcProtocolCaseLifetimeImpl);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/conformance").ProtocolPair);
	// @ts-expect-error Protocol case custody and observation types are private.
	void (null as unknown as import("../../src/conformance").ProtocolHostProbe);
	// @ts-expect-error Protocol case lifetime assembly is private.
	void (null as unknown as typeof import("../../src/conformance").createRpcProtocolCaseLifetime);
});
