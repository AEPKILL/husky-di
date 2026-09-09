/**
 * @overview Verifies framework observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { config, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	type IRpcConnection,
	RpcCloseReasonEnum,
	type RpcEvent,
} from "../../src/index";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolSession,
} from "../../src/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";
import {
	createAcceptorHarness,
	createConnectorHarness,
	createEmptySession,
	requirementDescriptor,
} from "./framework/test.utils";

describe("Framework requirement evidence", () => {
	it("RPC-EVENT-004 RPC-EVENT-007 keeps call observations safe, saturated, local, and pair-stable", async () => {
		const requests: IRpcProtocolCallRequest[] = [];
		const session: IRpcProtocolSession = {
			prepareInvocation(request, finish) {
				requests.push(request);
				return {
					start() {
						finish({
							type: RpcCallTerminalTypeEnum.returned,
							value: harness.host.normalizeApplicationValue({
								secret: "result-secret",
							}),
						});
					},
					cancel() {},
				};
			},
			forceClose() {},
		};
		const harness = createConnectorHarness({ session });
		await harness.connect();
		const nowValues = [100.9, 99.1, 0, Number.MAX_SAFE_INTEGER + 100];
		const now = vi.spyOn(Date, "now").mockImplementation(() => {
			const value = nowValues.shift();
			return value ?? 0;
		});
		try {
			await harness.connector.peer
				.resolve(requirementDescriptor)
				.echo({ secret: "argument-secret" });
			await harness.connector.peer
				.resolve(requirementDescriptor)
				.echo({ secret: "second-secret" });
		} finally {
			now.mockRestore();
		}

		const callEvents = harness.events.filter(
			(event) =>
				event.type === "call-started" || event.type === "call-finished",
		);
		expect(callEvents).toHaveLength(4);
		expect(callEvents[0]?.observationId).toBe(callEvents[1]?.observationId);
		expect(callEvents[2]?.observationId).toBe(callEvents[3]?.observationId);
		expect(callEvents[0]?.observationId).not.toBe(callEvents[2]?.observationId);
		expect(
			callEvents.filter((event) => event.type === "call-finished"),
		).toMatchObject([
			{ durationMs: 0 },
			{ durationMs: Number.MAX_SAFE_INTEGER },
		]);
		for (const event of callEvents) {
			const serialized = JSON.stringify(event);
			expect(serialized).not.toContain("argument-secret");
			expect(serialized).not.toContain("result-secret");
			expect(serialized).not.toMatch(
				/(args|result|details|stack|cause|sessionId|callId|sequence|ack|cursor|epoch|proof|credential|resumeToken|token)/iu,
			);
			expect(Object.values(event).some((value) => value instanceof Error)).toBe(
				false,
			);
		}
		expect(Reflect.ownKeys(requests[0] ?? {})).toEqual([
			"service",
			"method",
			"args",
		]);
		await harness.connector.close();
	});

	it("RPC-API-004 RPC-EVENT-006 keeps event delivery hot and peer terminal reasons local to Acceptor", async () => {
		const { acceptor, host } = createAcceptorHarness();
		const session = createEmptySession();
		const events: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => events.push(event));
		const sessionHost = host.admitSession(session);
		if (sessionHost === undefined) {
			throw new Error("Expected an admitted Acceptor Session.");
		}
		const lateEvents: RpcEvent[] = [];
		let completed = 0;
		let errors = 0;
		acceptor.event$.subscribe({
			next: (event) => lateEvents.push(event),
			error: () => {
				errors += 1;
			},
			complete: () => {
				completed += 1;
			},
		});
		expect(lateEvents).toEqual([]);
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		expect(acceptor.state.status).toBe("active");
		expect(acceptor.peers).toEqual([]);
		expect(lateEvents).toMatchObject([
			{ type: "peer-closed", reason: "remote-terminated" },
		]);
		expect(lateEvents[0]).toBe(events[events.length - 1]);
		expect(events.some((event) => event.type === "topology-closed")).toBe(
			false,
		);
		const connectionSource = new Subject<IRpcConnection>();
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen() {},
		});
		connectionSource.complete();
		expect(acceptor.state).toMatchObject({
			status: "active",
			listener: { status: "stopped", reason: "completed" },
		});
		expect(events.some((event) => event.type === "topology-closed")).toBe(
			false,
		);

		await acceptor.close();
		expect(
			events.filter((event) => event.type === "topology-closed"),
		).toHaveLength(1);
		expect(completed).toBe(1);
		expect(errors).toBe(0);
	});

	it("RPC-API-004 isolates an event subscriber failure from the committed Framework mutation", async () => {
		const harness = createConnectorHarness();
		const sessionHost = await harness.connect();
		const subscriberFailure = new Error("subscriber failure");
		const reported: unknown[] = [];
		const previousUnhandledError = config.onUnhandledError;
		config.onUnhandledError = (error) => reported.push(error);
		const subscription = harness.connector.event$.subscribe(() => {
			throw subscriberFailure;
		});
		try {
			sessionHost.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.waitFor(() => expect(reported).toContain(subscriberFailure));
			expect(harness.connector.peer.state).toEqual({ status: "recovering" });
		} finally {
			subscription.unsubscribe();
			config.onUnhandledError = previousUnhandledError;
		}
		await harness.connector.close();
	});

	it("RPC-API-005 publishes terminal observations only after the related public snapshots commit", async () => {
		const harness = createConnectorHarness();
		await harness.connect();
		let taskSettled = false;
		const observations: {
			readonly event: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly taskSettled: boolean;
		}[] = [];
		harness.connector.event$.subscribe((event) => {
			if (
				event.type === "peer-closed" ||
				event.type === "owner-closing" ||
				event.type === "topology-closed"
			) {
				observations.push({
					event: event.type,
					ownerStatus: harness.connector.state.status,
					peerStatus: harness.connector.peer.state.status,
					taskSettled,
				});
			}
		});

		const task = harness.connector.close().then(() => {
			taskSettled = true;
		});
		await task;

		expect(observations).toEqual([
			{
				event: "peer-closed",
				ownerStatus: "closing",
				peerStatus: "closed",
				taskSettled: false,
			},
			{
				event: "owner-closing",
				ownerStatus: "closing",
				peerStatus: "closed",
				taskSettled: false,
			},
			{
				event: "topology-closed",
				ownerStatus: "closed",
				peerStatus: "closed",
				taskSettled: false,
			},
		]);
	});

	it("RPC-STATE-003 preserves a terminal peer reason when Owner cleanup fails", async () => {
		const cleanupError = new Error("cleanup failed");
		const harness = createConnectorHarness({
			cleanup: () => Promise.reject(cleanupError),
		});
		const sessionHost = await harness.connect();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

		await expect(harness.connector.close()).rejects.toBe(cleanupError);
		expect(harness.connector.state).toEqual({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: cleanupError,
		});
		expect(harness.connector.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "remote-terminated",
		});
	});
});
