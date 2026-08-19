/**
 * @overview WebSocket Transport error and AbortSignal helpers.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

const abortSignalAbortedGetter = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;
const addEventListener = EventTarget.prototype.addEventListener;
const removeEventListener = EventTarget.prototype.removeEventListener;

export function createAbortError(): DOMException {
	return new DOMException(
		"The WebSocket Adapter startup was aborted.",
		"AbortError",
	);
}

export function isAbortSignalAborted(signal: AbortSignal): boolean {
	if (abortSignalAbortedGetter === undefined) {
		throw new TypeError(
			"The platform AbortSignal aborted getter is unavailable.",
		);
	}
	return Reflect.apply(abortSignalAbortedGetter, signal, []) as boolean;
}

export function addAbortListener(
	signal: AbortSignal,
	listener: () => void,
): () => void {
	Reflect.apply(addEventListener, signal, ["abort", listener, { once: true }]);
	return () => {
		Reflect.apply(removeEventListener, signal, ["abort", listener]);
	};
}

export function getWebSocketEventError(event: Event, fallback: string): Error {
	const value = Reflect.get(event, "error");
	return value instanceof Error ? value : new Error(fallback);
}

export function getWebSocketCloseError(event: Event): Error {
	const code = Reflect.get(event, "code");
	return new Error(
		`WebSocket closed abnormally${typeof code === "number" ? ` (code ${code})` : ""}.`,
	);
}
