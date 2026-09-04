/**
 * @overview RPC incoming-handler Scheduler permit-lifetime and fairness tests.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import { describe, expect, it } from "vitest";

import { RpcHandlerSchedulerImpl } from "../../src/impls/owner/rpc-handler-scheduler.impl";

describe("RPC Handler Scheduler", () => {
	it("releases an acquired permit when a job throws synchronously", async () => {
		const scheduler = new RpcHandlerSchedulerImpl(1, 1);
		const starts: string[] = [];
		const marker = new Error("unexpected synchronous job failure");

		scheduler.enqueue({}, () => {
			starts.push("throwing");
			throw marker;
		});
		scheduler.enqueue({}, () => {
			starts.push("next");
			return Promise.resolve();
		});

		await expect.poll(() => starts).toEqual(["throwing", "next"]);
	});

	it("observes a rejected job and releases its permit without an unhandled rejection", async () => {
		const scheduler = new RpcHandlerSchedulerImpl(1, 1);
		const starts: string[] = [];

		scheduler.enqueue({}, () => {
			starts.push("rejected");
			return Promise.reject(new Error("unexpected rejected job"));
		});
		scheduler.enqueue({}, () => {
			starts.push("next");
			return Promise.resolve();
		});

		await expect.poll(() => starts).toEqual(["rejected", "next"]);
	});

	it("holds Owner and per-Session permits until each job settles", async () => {
		const scheduler = new RpcHandlerSchedulerImpl(2, 1);
		const firstSession = {};
		const secondSession = {};
		const thirdSession = {};
		const first = Promise.withResolvers<void>();
		const second = Promise.withResolvers<void>();
		const third = Promise.withResolvers<void>();
		const starts: string[] = [];

		scheduler.enqueue(firstSession, () => {
			starts.push("first-a");
			return first.promise;
		});
		scheduler.enqueue(firstSession, () => {
			starts.push("first-b");
			return Promise.resolve();
		});
		scheduler.enqueue(secondSession, () => {
			starts.push("second-a");
			return second.promise;
		});
		scheduler.enqueue(thirdSession, () => {
			starts.push("third-a");
			return third.promise;
		});

		await expect.poll(() => starts).toEqual(["first-a", "second-a"]);
		first.resolve();
		await expect.poll(() => starts).toEqual(["first-a", "second-a", "third-a"]);
		third.resolve();
		await expect
			.poll(() => starts)
			.toEqual(["first-a", "second-a", "third-a", "first-b"]);
		second.resolve();
	});

	it("round-robins ready Sessions while preserving each Session FIFO", async () => {
		const scheduler = new RpcHandlerSchedulerImpl(1, 1);
		const firstSession = {};
		const secondSession = {};
		const firstA = Promise.withResolvers<void>();
		const firstB = Promise.withResolvers<void>();
		const secondA = Promise.withResolvers<void>();
		const secondB = Promise.withResolvers<void>();
		const starts: string[] = [];
		const enqueue = (
			session: object,
			label: string,
			settlement: Promise<void>,
		): void => {
			scheduler.enqueue(session, () => {
				starts.push(label);
				return settlement;
			});
		};

		enqueue(firstSession, "first-a", firstA.promise);
		enqueue(firstSession, "first-b", firstB.promise);
		enqueue(secondSession, "second-a", secondA.promise);
		enqueue(secondSession, "second-b", secondB.promise);

		await expect.poll(() => starts).toEqual(["first-a"]);
		firstA.resolve();
		await expect.poll(() => starts).toEqual(["first-a", "second-a"]);
		secondA.resolve();
		await expect.poll(() => starts).toEqual(["first-a", "second-a", "first-b"]);
		firstB.resolve();
		await expect
			.poll(() => starts)
			.toEqual(["first-a", "second-a", "first-b", "second-b"]);
		secondB.resolve();
	});

	it("cancels queued work without acquiring a permit", async () => {
		const scheduler = new RpcHandlerSchedulerImpl(1, 1);
		const blocker = Promise.withResolvers<void>();
		let canceledJobStarted = false;
		let sentinelStarted = false;

		scheduler.enqueue({}, () => blocker.promise);
		const cancel = scheduler.enqueue({}, () => {
			canceledJobStarted = true;
			return Promise.resolve();
		});
		cancel();
		cancel();
		scheduler.enqueue({}, () => {
			sentinelStarted = true;
			return Promise.resolve();
		});

		blocker.resolve();
		await expect.poll(() => sentinelStarted).toBe(true);
		expect(canceledJobStarted).toBe(false);
	});
});
