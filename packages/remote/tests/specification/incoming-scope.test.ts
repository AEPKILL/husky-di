/**
 * @overview Verifies incoming scope.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	RpcCloseReasonEnum,
	RpcStateStatusEnum,
} from "../../src/index";
import type {
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolSession,
	RpcProtocolIncomingCallReservation,
} from "../../src/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
} from "../../src/protocol";
import {
	connectProtocolSession,
	createProtocolHarness,
	IDeferredService,
} from "./test.utils";

describe("custom Protocol incoming calls", () => {
	it("RPC-SPI-006 releases and faults a synchronous incoming scope that does not commit", async () => {
		let forceCalls = 0;
		let consumeCalls = 0;
		let insideReservationCall = false;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const request = {
			service: "unknown.scope",
			method: "missing",
			args: host.normalizeApplicationArguments([]),
		};

		insideReservationCall = true;
		expect(() =>
			sessionHost.reserveIncomingCall(request, () => {
				consumeCalls += 1;
				expect(insideReservationCall).toBe(true);
				return undefined;
			}),
		).toThrow("without committing");
		insideReservationCall = false;
		expect(consumeCalls).toBe(1);
		expect(forceCalls).toBe(1);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});

	it("RPC-SPI-006 preserves a pre-commit throw and never inspects a non-undefined thenable return", async () => {
		const preCommitFailure = new Error("pre-commit failure");
		let firstForceCalls = 0;
		const firstSession: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				firstForceCalls += 1;
			},
		};
		const first = await connectProtocolSession(firstSession);
		const firstRequest = {
			service: "unknown.pre-throw",
			method: "missing",
			args: first.host.normalizeApplicationArguments([]),
		};
		let caught: unknown;
		try {
			first.sessionHost.reserveIncomingCall(firstRequest, () => {
				throw preCommitFailure;
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(preCommitFailure);
		expect(firstForceCalls).toBe(1);
		await first.connector.close();

		let thenReads = 0;
		let secondForceCalls = 0;
		const secondSession: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				secondForceCalls += 1;
			},
		};
		const second = await connectProtocolSession(secondSession);
		// biome-ignore lint/suspicious/noThenProperty: Verifies that the Protocol callback result is compared without thenable assimilation.
		const maliciousThenable = Object.defineProperty({}, "then", {
			get() {
				thenReads += 1;
				throw new Error("then must not be read");
			},
		});
		expect(() =>
			second.sessionHost.reserveIncomingCall(
				{
					service: "unknown.non-undefined",
					method: "missing",
					args: second.host.normalizeApplicationArguments([]),
				},
				(() => maliciousThenable) as never,
			),
		).toThrow("must return undefined synchronously");
		expect({ thenReads, secondForceCalls }).toEqual({
			thenReads: 0,
			secondForceCalls: 1,
		});
		await second.connector.close();
	});

	it("RPC-SPI-006 RPC-SPI-007 terminalizes committed incoming work before propagating a scope failure", async () => {
		const postCommitFailure = new Error("post-commit failure");
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.post-commit.v1",
			methods: { run: true },
		});
		const handler = vi.fn(() => Promise.resolve(1));
		connector.peer.expose(descriptor, { run: handler });
		let call: IRpcProtocolIncomingHandlerCall | undefined;
		let caught: unknown;
		try {
			sessionHost.reserveIncomingCall(
				{
					service: "example.post-commit.v1",
					method: "run",
					args: host.normalizeApplicationArguments([1]),
				},
				(reservation) => {
					if (reservation.kind !== RpcIncomingCallKindEnum.handler) {
						throw new Error("Expected a handler reservation.");
					}
					call = reservation.commit();
					throw postCommitFailure;
				},
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(postCommitFailure);
		await expect(call?.handlerOutcome).resolves.toEqual({
			type: RpcCallTerminalTypeEnum.notStarted,
		});
		await Promise.resolve();
		expect(handler).not.toHaveBeenCalled();
		expect(forceCalls).toBe(1);
		expect(
			events
				.filter(
					(event) =>
						event.type === "call-started" || event.type === "call-finished",
				)
				.map((event) => event.type),
		).toEqual(["call-started", "call-finished"]);
		await connector.close();
	});

	it("RPC-SPI-006 RPC-SPI-007 terminalizes committed incoming work before rejecting a non-undefined result", async () => {
		let forceCalls = 0;
		let thenReads = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		// biome-ignore lint/suspicious/noThenProperty: Verifies post-commit contract handling without thenable assimilation.
		const maliciousThenable = Object.defineProperty({}, "then", {
			get() {
				thenReads += 1;
				throw new Error("then must not be read");
			},
		});

		expect(() =>
			sessionHost.reserveIncomingCall(
				{
					service: "unknown.post-commit-result",
					method: "missing",
					args: host.normalizeApplicationArguments([]),
				},
				((reservation: RpcProtocolIncomingCallReservation) => {
					if (reservation.kind !== RpcIncomingCallKindEnum.unknown) {
						throw new Error("Expected an unknown reservation.");
					}
					reservation.commit();
					return maliciousThenable;
				}) as never,
			),
		).toThrow("must return undefined synchronously");
		expect({ forceCalls, thenReads }).toEqual({ forceCalls: 1, thenReads: 0 });
		expect(
			events
				.filter(
					(event) =>
						event.type === "call-started" || event.type === "call-finished",
				)
				.map((event) => ({
					type: event.type,
					code: Reflect.get(event, "code"),
				})),
		).toEqual([
			{ type: "call-started", code: undefined },
			{ type: "call-finished", code: "unknown-service" },
		]);
		await connector.close();
	});

	it("RPC-SPI-006 makes double and escaped commit capabilities sticky", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const first = await connectProtocolSession(session);
		const request = {
			service: "unknown.double-commit",
			method: "missing",
			args: first.host.normalizeApplicationArguments([]),
		};
		expect(() =>
			first.sessionHost.reserveIncomingCall(request, (reservation) => {
				reservation.commit();
				try {
					reservation.commit();
				} catch {}
				return undefined;
			}),
		).toThrow("more than once");
		expect(forceCalls).toBe(1);
		await first.connector.close();

		let escapedCommit: (() => IRpcProtocolIncomingCall) | undefined;
		let secondForceCalls = 0;
		const secondSession: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				secondForceCalls += 1;
			},
		};
		const second = await connectProtocolSession(secondSession);
		const reserved = second.sessionHost.reserveIncomingCall(
			{
				service: "unknown.escaped-commit",
				method: "missing",
				args: second.host.normalizeApplicationArguments([]),
			},
			(reservation) => {
				if (reservation.kind !== RpcIncomingCallKindEnum.unknown) {
					throw new Error("Expected an unknown reservation.");
				}
				escapedCommit = reservation.commit;
				reservation.commit();
				return undefined;
			},
		);
		expect(reserved).toBe(true);
		expect(() => escapedCommit?.()).toThrow("escaped its synchronous scope");
		expect(secondForceCalls).toBe(1);
		await second.connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-006 faults only the violating Acceptor Session", async () => {
		const harness = createProtocolHarness();
		const acceptor = createRpcAcceptor({
			protocolFactory: harness.acceptorFactory,
		});
		const host = harness.acceptorHosts[0];
		if (host === undefined) {
			throw new Error("Expected an Acceptor Protocol host.");
		}
		let violatingForceCalls = 0;
		let siblingForceCalls = 0;
		const violatingHost = host.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				violatingForceCalls += 1;
			},
		});
		const siblingHost = host.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				siblingForceCalls += 1;
			},
		});
		const [violatingPeer, siblingPeer] = acceptor.peers;
		if (
			violatingHost === undefined ||
			siblingHost === undefined ||
			violatingPeer === undefined ||
			siblingPeer === undefined
		) {
			throw new Error("Expected two admitted Acceptor Sessions.");
		}

		expect(() =>
			violatingHost.reserveIncomingCall(
				{
					service: "unknown.acceptor-scope",
					method: "missing",
					args: host.normalizeApplicationArguments([]),
				},
				() => undefined,
			),
		).toThrow("without committing");
		expect(violatingForceCalls).toBe(1);
		expect(siblingForceCalls).toBe(0);
		expect(acceptor.state.status).toBe(RpcStateStatusEnum.active);
		expect(violatingPeer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.protocolFault,
		});
		expect(siblingPeer.state.status).toBe(RpcStateStatusEnum.connected);
		expect(acceptor.peers).toEqual([siblingPeer]);
		await acceptor.close();
	});
});
