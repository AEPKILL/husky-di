/**
 * @overview Public Owner termination deadline and reentrant lifetime acceptance.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import type {
	IRpcConnection,
	IRpcProtocolAcceptorHost,
} from "../../src/protocol";

describe.each([
	"Connector",
	"Acceptor",
] as const)("%s termination lifetime", (role) => {
	afterEach(() => vi.useRealTimers());

	it("RPC-LIFE-001 RPC-SHUTDOWN-001 gates new exposure while termination is queued behind an active snapshot", async () => {
		const owner = createOwner(role, { shutdown: async () => {} });
		const descriptor = createRemoteServiceDescriptor(
			createServiceIdentifier<{ echo(value: string): Promise<string> }>(
				"TerminationExposure",
			),
			{
				wireName: "termination.exposure",
				methods: { echo: true },
			},
		);
		const source = new Subject<IRpcConnection>();
		let task: Promise<void> | undefined;
		let observedStatus: string | undefined;
		let exposureError: unknown;
		const requestTermination = () => {
			task = owner.shutdown();
			observedStatus = owner.state.status;
			try {
				const exposureOwner = "peer" in owner ? owner.peer : owner;
				exposureOwner.expose(descriptor, {
					async echo(value) {
						return value;
					},
				});
			} catch (error) {
				exposureError = error;
			}
		};
		if ("peer" in owner) {
			owner.peer.state$.subscribe((state) => {
				if (state.status === "connecting") requestTermination();
			});
			await expect(
				owner.connect({
					adapter: { connection$: source.asObservable(), async connect() {} },
				}),
			).rejects.toMatchObject({ code: "unavailable" });
		} else {
			owner.state$.subscribe((state) => {
				if (state.status === "active" && state.listener.status === "starting")
					requestTermination();
			});
			await expect(
				owner.listen({ connection$: source.asObservable(), async listen() {} }),
			).rejects.toMatchObject({ name: "AbortError" });
		}
		await task;

		expect(observedStatus).toBe("active");
		expect(exposureError).toMatchObject({ code: "unavailable" });
		expect(owner.shutdown()).toBe(task);
	});

	it("RPC-SHUTDOWN-006 counts draining publication against the absolute grace deadline", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const shutdown = vi.fn(async () => {});
		const close = vi.fn();
		const owner = createOwner(role, { shutdown, close });
		owner.event$.subscribe((event) => {
			if (event.type === "owner-draining") {
				vi.setSystemTime(10);
			}
		});

		await owner.shutdown();

		expect(shutdown).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(1);
		expect(owner.state).toMatchObject({
			status: "closed",
			reason: "shutdown-deadline",
		});
	});
	it.each([
		"fulfilled",
		"rejected",
		"pending",
	] as const)("RPC-SHUTDOWN-006 expires grace consumed by synchronous Protocol shutdown with %s settlement", async (settlement) => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const grace = Promise.withResolvers<void>();
		const close = vi.fn();
		const owner = createOwner(role, {
			shutdown() {
				vi.setSystemTime(10);
				if (settlement === "fulfilled") {
					grace.resolve();
				} else if (settlement === "rejected") {
					grace.reject(new Error("late Protocol rejection"));
				}
				return grace.promise;
			},
			close,
		});

		await owner.shutdown();

		expect(owner.state).toMatchObject({
			status: "closed",
			reason: "shutdown-deadline",
		});
		expect(close).toHaveBeenCalledTimes(1);
		grace.resolve();
	});

	it.each([
		0, 10,
	])("RPC-SHUTDOWN-006 classifies a synchronous Protocol throw at elapsed %s", async (elapsed) => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const owner = createOwner(role, {
			shutdown() {
				vi.setSystemTime(elapsed);
				throw new Error("Protocol shutdown failed");
			},
		});

		await owner.shutdown();

		expect(owner.state).toMatchObject({
			status: "closed",
			reason: elapsed === 0 ? "forced-close" : "shutdown-deadline",
		});
	});

	it("RPC-LIFE-001 RPC-SHUTDOWN-006 revokes a draining continuation when its observer closes", async () => {
		const shutdown = vi.fn(async () => {});
		const close = vi.fn();
		const cleanup = vi.fn(async () => {});
		const owner = createOwner(role, { shutdown, close, cleanup });
		let reentrantTask: Promise<void> | undefined;
		owner.event$.subscribe((event) => {
			if (event.type === "owner-draining") {
				reentrantTask = owner.close();
			}
		});

		const task = owner.shutdown();
		expect(reentrantTask).toBe(task);
		await task;

		expect(owner.close()).toBe(task);
		expect(owner.shutdown()).toBe(task);
		expect(shutdown).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(1);
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(owner.state).toMatchObject({ reason: "forced-close" });
	});

	it.each([
		"fulfilled",
		"rejected",
	] as const)("RPC-LIFE-001 RPC-SHUTDOWN-006 consumes late %s Protocol settlement after synchronous close reentry", async (settlement) => {
		const grace = Promise.withResolvers<void>();
		const close = vi.fn();
		const cleanup = vi.fn(async () => {});
		let reentrantTask: Promise<void> | undefined;
		const owner = createOwner(role, {
			shutdown() {
				reentrantTask = owner.close();
				return grace.promise;
			},
			close,
			cleanup,
		});

		const task = owner.shutdown();
		expect(reentrantTask).toBe(task);
		await task;
		const finalState = owner.state;
		if (settlement === "fulfilled") {
			grace.resolve();
		} else {
			grace.reject(new Error("revoked Protocol rejection"));
		}
		await Promise.resolve();

		expect(owner.state).toBe(finalState);
		expect(owner.close()).toBe(task);
		expect(owner.shutdown()).toBe(task);
		expect(close).toHaveBeenCalledTimes(1);
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it("RPC-LIFE-001 RPC-SHUTDOWN-006 keeps closing graceful across explicit close and settles after final publication", async () => {
		const cleanup = Promise.withResolvers<void>();
		const close = vi.fn();
		const events: string[] = [];
		const owner = createOwner(role, {
			shutdown: async () => {},
			close,
			cleanup: () => cleanup.promise,
		});
		owner.state$.subscribe({
			next: (state) => {
				if (state.status === "closed") events.push("final-state");
			},
			complete: () => events.push("state-complete"),
		});
		owner.event$.subscribe({
			next: (event) => {
				if (event.type === "topology-closed") events.push("topology-closed");
			},
			complete: () => events.push("events-complete"),
		});

		const task = owner.shutdown();
		void task.then(() => events.push("task"));
		await Promise.resolve();
		expect(owner.state.status).toBe("closing");
		expect(owner.close()).toBe(task);
		expect(owner.shutdown()).toBe(task);
		cleanup.resolve();
		await task;

		expect(close).not.toHaveBeenCalled();
		expect(owner.state).toMatchObject({ reason: "graceful-shutdown" });
		expect(events).toEqual([
			"final-state",
			"state-complete",
			"topology-closed",
			"events-complete",
			"task",
		]);
	});

	it("RPC-LIFE-001 RPC-CLEANUP-001 freezes a cleanup timeout before late resource fulfillment", async () => {
		vi.useFakeTimers();
		const resource = Promise.withResolvers<void>();
		const cleanup = vi.fn(() => resource.promise);
		const owner = createOwner(role, { shutdown: async () => {}, cleanup });
		const task = owner.close();
		const failureTask = task.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(10);
		const failure = await failureTask;
		const finalState = owner.state;
		expect(finalState).toMatchObject({
			status: "closed",
			reason: "cleanup-failed",
			error: failure,
		});
		resource.resolve();
		await vi.advanceTimersByTimeAsync(100);

		expect(owner.state).toBe(finalState);
		expect(owner.close()).toBe(task);
		expect(owner.shutdown()).toBe(task);
		await expect(task).rejects.toBe(failure);
		expect(cleanup).toHaveBeenCalledTimes(1);
	});
});

it.each([
	"shutdown",
	"close",
] as const)("RPC-LIFE-001 RPC-SHUTDOWN-001 Connector %s gates work and caches the task before abort and snapshot commit", async (method) => {
	const source = new Subject<IRpcConnection>();
	const connector = createRpcConnector({
		protocolFactory: () => ({
			async bind() {},
			async shutdown() {},
			close() {},
			async cleanup() {},
		}),
	});
	let snapshotsDuringAbort: readonly string[] | undefined;
	let reentrantTask: Promise<void> | undefined;
	let lateStartup: Promise<void> | undefined;
	const lateConnect = vi.fn(async () => {});
	const startup = connector.connect({
		adapter: {
			connection$: source.asObservable(),
			connect(signal) {
				return new Promise<void>((resolve) => {
					signal.addEventListener(
						"abort",
						() => {
							snapshotsDuringAbort = [
								connector.state.status,
								connector.peer.state.status,
							];
							reentrantTask = connector.close();
							lateStartup = connector.connect({
								adapter: {
									connection$: source.asObservable(),
									connect: lateConnect,
								},
							});
							resolve();
						},
						{ once: true },
					);
				});
			},
		},
	});

	const task = connector[method]();
	await expect(startup).rejects.toMatchObject({ name: "AbortError" });
	await expect(lateStartup).rejects.toMatchObject({ code: "unavailable" });
	await task;

	expect(snapshotsDuringAbort).toEqual(["active", "connecting"]);
	expect(reentrantTask).toBe(task);
	expect(connector.shutdown()).toBe(task);
	expect(lateConnect).not.toHaveBeenCalled();
});

it.each([
	"shutdown",
	"close",
] as const)("RPC-LIFE-001 RPC-SHUTDOWN-001 Acceptor %s commits snapshots before listener abort and rejects reentrant admission", async (method) => {
	let protocolHost: IRpcProtocolAcceptorHost | undefined;
	const source = new Subject<IRpcConnection>();
	const acceptor = createRpcAcceptor({
		protocolFactory(host) {
			protocolHost = host;
			return {
				async accept() {},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		},
	});
	let statusDuringAbort: string | undefined;
	let reentrantTask: Promise<void> | undefined;
	const admissions: unknown[] = [];
	await acceptor.listen({
		connection$: source.asObservable(),
		async listen(signal) {
			signal.addEventListener(
				"abort",
				() => {
					statusDuringAbort = acceptor.state.status;
					reentrantTask = acceptor.close();
					admissions.push(
						protocolHost?.admitSession({
							prepareInvocation: () => undefined,
							forceClose() {},
						}),
					);
				},
				{ once: true },
			);
		},
	});

	const task = acceptor[method]();
	await task;

	expect(statusDuringAbort).toBe(
		method === "shutdown" ? "draining" : "closing",
	);
	expect(reentrantTask).toBe(task);
	expect(acceptor.shutdown()).toBe(task);
	expect(admissions).toEqual([undefined]);
	expect(acceptor.peers).toEqual([]);
});

function createOwner(
	role: "Connector" | "Acceptor",
	behavior: {
		readonly shutdown: () => Promise<void>;
		readonly close?: () => void;
		readonly cleanup?: () => Promise<void>;
	},
) {
	const protocol = {
		...behavior,
		close: behavior.close ?? (() => {}),
		cleanup: behavior.cleanup ?? (async () => {}),
	};
	return role === "Connector"
		? createRpcConnector({
				runtimePolicy: { shutdownDeadlineMs: 10 },
				protocolFactory: () => ({ ...protocol, async bind() {} }),
			})
		: createRpcAcceptor({
				runtimePolicy: { shutdownDeadlineMs: 10 },
				protocolFactory: () => ({ ...protocol, async accept() {} }),
			});
}
