/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:34:07
 */

import type { IDisposable } from "@/interfaces/disposable.interface";

export type DisposableCleanup = () => void;

export class Disposable implements IDisposable {
	private _disposed: boolean = false;
	private _cleanup?: DisposableCleanup;

	constructor(cleanup?: DisposableCleanup) {
		this._cleanup = cleanup;
	}

	public get disposed(): boolean {
		return this._disposed;
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this._cleanup?.();
		this._cleanup = undefined;
	}
}
