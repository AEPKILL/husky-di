/**
 * @overview Compile-time private Protocol implementation export probe.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolIncomingSourceReservation,
	IRpcProtocolSession,
	IRpcProtocolStream,
	IRpcProtocolSubscriberSink,
} from "../../src/protocol";

// @ts-expect-error RPC-PKG-003 keeps the built-in Protocol private.
type MissingRpcProtocolImpl = import("../../src/index").RpcProtocolImpl;
void (null as unknown as MissingRpcProtocolImpl);

declare const args: IRpcApplicationArgumentsSnapshot;
declare const snapshot: IRpcApplicationSnapshot;
declare const session: IRpcProtocolSession;
declare const stream: IRpcProtocolStream;
declare const subscriberSink: IRpcProtocolSubscriberSink;
declare const sourceReservation: IRpcProtocolIncomingSourceReservation;

session.reserveStream({
	service: "example.type-probe.v1",
	member: "events",
	kind: "stream-method",
	args,
});
session.reserveStream({
	service: "example.type-probe.v1",
	member: "events$",
	kind: "stream-property",
});
subscriberSink.reserveItem(snapshot).commit();
subscriberSink.reserveTerminal({ type: "completed" }).commit();
sourceReservation.commit({
	reserveEmission: () => ({ commit() {}, fail() {} }),
	finish: () => undefined,
});

// @ts-expect-error RPC-FLOW-001 keeps caller demand out of the stream control seam.
stream.request(1);
// @ts-expect-error RPC-FLOW-001 keeps a public window out of the stream control seam.
void stream.window;
// @ts-expect-error RPC-FLOW-001 keeps capacity queries out of the stream control seam.
void stream.capacity;

session.reserveStream({
	service: "example.type-probe.v1",
	member: "events$",
	kind: "stream-property",
	// @ts-expect-error RPC-SPI-013 stream properties do not carry arguments.
	args,
});

// @ts-expect-error RPC-SPI-017 does not expose raw source values.
sourceReservation.commit({ next: () => undefined });
