/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:36:34
 */

import type { Cleanup, IDisposable } from "@/interfaces/disposable.interface";

export function createAssertNotDisposed(
	name: string,
): (disposable: IDisposable) => void {
	return (
		disposable: IDisposable,
	): asserts disposable is Omit<IDisposable, "disposed"> & {
		disposed: false;
	} => {
		if (disposable.disposed) {
			throw new Error(`${name} is disposed`);
		}
	};
}

export function toDisposed(cleanup: Cleanup): IDisposable {
	let disposed = false;
	return {
		get disposed() {
			return disposed;
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			cleanup();
		},
	};
}
