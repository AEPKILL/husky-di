/**
 * @overview Typed event behavior tests.
 * @author AEPKILL
 * @created 2026-08-19 01:12:00
 */

import { describe, expect, it } from "vitest";
import { TypedEventImpl } from "../src/impls/typed-event.impl";

type TestEvents = {
	value: (value: number) => void;
};

describe("TypedEventImpl", () => {
	it("should keep listener cleanup idempotent across later subscriptions", () => {
		const event = new TypedEventImpl<TestEvents>();
		const values: number[] = [];
		const listener = (value: number) => values.push(value);
		const firstCleanup = event.on("value", listener);

		firstCleanup();
		event.on("value", listener);
		firstCleanup();
		event.emit("value", 1);

		expect(values).toEqual([1]);
	});

	it("should return the same cleanup for an active duplicate listener", () => {
		const event = new TypedEventImpl<TestEvents>();
		let calls = 0;
		const listener = () => calls++;

		const firstCleanup = event.on("value", listener);
		const secondCleanup = event.on("value", listener);
		firstCleanup();
		event.emit("value", 1);

		expect(secondCleanup).toBe(firstCleanup);
		expect(calls).toBe(0);
	});

	it("should make listener cleanup a no-op after disposal", () => {
		const event = new TypedEventImpl<TestEvents>();
		const cleanup = event.on("value", () => undefined);

		event.dispose();

		expect(cleanup).not.toThrow();
	});

	it("should not let stale cleanup remove a subscription added after off", () => {
		const event = new TypedEventImpl<TestEvents>();
		const values: number[] = [];
		const listener = (value: number) => values.push(value);
		const staleCleanup = event.on("value", listener);

		event.off("value", listener);
		event.on("value", listener);
		staleCleanup();
		event.emit("value", 1);

		expect(values).toEqual([1]);
	});

	it("should use a stable listener snapshot during reentrant emit", () => {
		const event = new TypedEventImpl<TestEvents>();
		const calls: string[] = [];
		let nested = false;
		let cleanupB = (): void => undefined;
		const listenerC = () => calls.push("C");
		const listenerA = () => {
			if (nested) {
				calls.push("A:nested");
				return;
			}

			calls.push("A:outer");
			cleanupB();
			event.on("value", listenerC);
			nested = true;
			event.emit("value", 2);
		};
		const listenerB = () => calls.push("B");
		event.on("value", listenerA);
		cleanupB = event.on("value", listenerB);

		event.emit("value", 1);

		expect(calls).toEqual(["A:outer", "A:nested", "C", "B"]);
	});
});
