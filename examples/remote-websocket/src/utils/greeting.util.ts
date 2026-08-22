/**
 * @overview Implements the ordinary and abortable Node greeting methods.
 * @author AEPKILL
 * @created 2026-08-23 00:07:49
 */

import { setTimeout as wait } from "node:timers/promises";

export async function greet(name: string, delayMs: number): Promise<string> {
	assertDelay(delayMs);
	await wait(delayMs);
	return `Hello, ${name}!`;
}

export async function greetCancelable(
	name: string,
	delayMs: number,
	signal: AbortSignal,
): Promise<string> {
	assertDelay(delayMs);
	await wait(delayMs, undefined, { signal });
	return `Hello, ${name}!`;
}

function assertDelay(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
		throw new RangeError("delayMs must be a safe integer from 0 to 10000.");
	}
}
