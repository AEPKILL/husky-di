/**
 * Disposable registry implementation.
 *
 * @overview
 * Implements a registry pattern for managing disposable resources. Tracks
 * multiple disposable objects and cleanup functions, disposing them all
 * when the registry itself is disposed. Useful for managing resource cleanup
 * in complex objects that own multiple resources.
 *
 * @author AEPKILL
 * @created 2025-07-29 22:35:26
 */

import type { Cleanup, IDisposable } from "@/interfaces/disposable.interface";
import { toDisposed } from "@/utils/disposable.utils";

/**
 * Registry for managing disposable resources.
 *
 * @remarks
 * Collects disposable objects and cleanup functions, disposing them all
 * when the registry is disposed. Disposal is idempotent and handles errors
 * gracefully by continuing to dispose remaining resources even if one fails.
 */
export class DisposableRegistry implements IDisposable {
	private _disposed: boolean = false;
	private _disposables: Set<IDisposable> = new Set();

	/**
	 * Gets whether the registry has been disposed.
	 *
	 * @returns True if disposed, false otherwise
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Adds a disposable object to the registry.
	 *
	 * @param disposable - The disposable object to register
	 */
	public addDisposable(disposable: IDisposable): void {
		this._disposables.add(disposable);
	}

	/**
	 * Adds a cleanup function to the registry.
	 *
	 * @param cleanup - The cleanup function to register
	 */
	public addCleanup(cleanup: Cleanup): void {
		this._disposables.add(toDisposed(cleanup));
	}

	/**
	 * Disposes all registered disposables and clears the registry.
	 *
	 * @remarks
	 * Disposal is idempotent - calling this multiple times has the same effect.
	 * Errors during disposal are caught and ignored to ensure all resources
	 * are attempted to be disposed.
	 */
	public dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;

		for (const disposable of this._disposables) {
			if (disposable.disposed) {
				continue;
			}
			try {
				disposable.dispose();
			} catch {
				// Ignore errors during disposal to ensure all resources are attempted
			}
		}
		this._disposables.clear();
	}
}
