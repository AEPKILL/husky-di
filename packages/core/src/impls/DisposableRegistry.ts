/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:35:26
 */

import type { Cleanup, IDisposable } from "@/interfaces/disposable.interface";
import { toDisposed } from "@/utils/disposable.utils";

export class DisposableRegistry implements IDisposable {
	private _disposed: boolean = false;
	private _disposables: Set<IDisposable> = new Set();

	public get disposed(): boolean {
		return this._disposed;
	}

	public addDisposable(disposable: IDisposable): void {
		this._disposables.add(disposable);
	}

	public addCleanup(cleanup: Cleanup): void {
		this._disposables.add(toDisposed(cleanup));
	}

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
			} catch {}
		}
		this._disposables.clear();
	}
}
