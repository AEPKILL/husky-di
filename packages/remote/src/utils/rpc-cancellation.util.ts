/**
 * @overview Validates the caller-only trailing RPC cancellation control slot.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";

const abortedGetter = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;
const addEventListener = EventTarget.prototype.addEventListener;
const removeEventListener = EventTarget.prototype.removeEventListener;

if (abortedGetter === undefined) {
	throw new Error("The platform AbortSignal aborted getter is unavailable.");
}

export interface RpcInvocationArguments {
	readonly applicationArguments: readonly unknown[];
	readonly signal: AbortSignal | undefined;
}

function readAborted(value: unknown): boolean {
	try {
		return Reflect.apply(abortedGetter as () => boolean, value, []);
	} catch {
		throw new TypeError(
			"Cancelable RPC methods require a platform AbortSignal or undefined.",
		);
	}
}

/** Splits and validates the non-wire cancellation slot before other preflight. */
export function prepareRpcInvocationArguments(
	cancelable: boolean,
	actualArguments: readonly unknown[],
): RpcInvocationArguments {
	if (!cancelable) {
		return { applicationArguments: actualArguments, signal: undefined };
	}
	if (actualArguments.length === 0) {
		throw new TypeError(
			"Cancelable RPC methods require a trailing control argument.",
		);
	}

	const applicationArguments = actualArguments.slice(0, -1);
	const control = actualArguments[actualArguments.length - 1];
	if (control === undefined) {
		return { applicationArguments, signal: undefined };
	}
	if (readAborted(control)) {
		throw createRpcException(RpcExceptionCodeEnum.canceled);
	}
	return { applicationArguments, signal: control as AbortSignal };
}

/** Installs through captured intrinsics and closes the aborted-check race. */
export function installRpcAbortListener(
	signal: AbortSignal,
	onAbort: () => void,
): () => void {
	let fired = false;
	const listener = () => {
		if (!fired) {
			fired = true;
			onAbort();
		}
	};
	Reflect.apply(addEventListener, signal, ["abort", listener, { once: true }]);
	if (readAborted(signal)) {
		listener();
	}

	return () => {
		Reflect.apply(removeEventListener, signal, ["abort", listener]);
	};
}
