/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-26 11:23:17
 */

import type { Ref } from "@/types/ref.type";

export class InstanceRef<T> implements Ref<T> {
	private _current: T | undefined;
	private _resolved = false;
	private _createInstance: (() => T) | null;

	constructor(createInstance: () => T) {
		this._createInstance = createInstance;
	}

	get current(): T {
		if (!this._resolved) {
			// biome-ignore lint/style/noNonNullAssertion: we promise the instance factory must be not null
			this._current = this._createInstance!();
			this._resolved = true;

			// Ref 引用这里可以释放掉实例工厂
			// 从而释放 resolveRecord 和 resolveContext
			this._createInstance = null;
		}

		return this._current as T;
	}

	get resolved(): boolean {
		return this._resolved;
	}
}
