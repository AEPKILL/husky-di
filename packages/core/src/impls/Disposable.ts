/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:34:07
 */

import type { IDisposable } from "@/interfaces/disposable.interface";

export class Disposable implements IDisposable {
	private _disposed: boolean = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
	}
}
