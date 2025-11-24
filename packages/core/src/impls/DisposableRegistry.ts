/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:35:26
 */

import { type Cleanup, Disposable } from "@/impls/Disposable";
import type { IDisposable } from "@/interfaces/disposable.interface";
import { toDisposed } from "@/utils/disposable.utils";

export class DisposableRegistry extends Disposable implements IDisposable {
	private _disposables: Set<IDisposable> = new Set();

	constructor() {
		super(() => {
			this._disposables.forEach((disposable) => disposable.dispose());
			this._disposables.clear();
		});
	}

	public addDisposable(disposable: IDisposable): void {
		this._disposables.add(disposable);
	}

	public addCleanup(cleanup: Cleanup): void {
		this._disposables.add(toDisposed(cleanup));
	}
}
