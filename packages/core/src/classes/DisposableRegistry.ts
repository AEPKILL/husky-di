/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:35:26
 */

import { Disposable } from "@/impls/Disposable";
import type { IDisposable } from "@/interfaces/disposable.interface";

export class DisposableRegistry extends Disposable implements IDisposable {
	private _disposables: IDisposable[] = [];

	constructor() {
		super(() => {
			this._disposables.forEach((disposable) => disposable.dispose());
			this._disposables = [];
		});
	}

	public addDisposable(disposable: IDisposable): void {
		this._disposables.push(disposable);
	}
}
