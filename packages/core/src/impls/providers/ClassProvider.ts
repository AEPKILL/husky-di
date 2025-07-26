/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 18:11:25
 */

import { ProviderBase } from "@/classes/base/provider.base";
import type { ClassProviderOptions } from "@/interfaces/provider.interface";
import type { Constructor } from "@/types/constructor.type";

export class ClassProvider<T> extends ProviderBase<T> {
	private readonly _class: Constructor<T>;

	constructor(options: ClassProviderOptions<T>) {
		super(options);
		const { useClass } = options;

		this._class = useClass;
	}

	clone(): ClassProvider<T> {
		return new ClassProvider({
			lifecycle: this.lifecycle,
			useClass: this._class,
		});
	}

	resolve(): T {
		return new this._class();
	}
}
