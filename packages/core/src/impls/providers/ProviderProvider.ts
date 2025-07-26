/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from "@/classes/base/provider.base";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	ProviderOptions,
	ProviderResolveOptions,
} from "@/interfaces/provider.interface";
import type { ResolveContext } from "@/types/resolve-context.type";

export type Factory<T> = (
	container: IContainer,
	resolveContext: ResolveContext,
) => T;
export interface FactoryProviderOptions<T> extends ProviderOptions {
	useFactory: Factory<T>;
}

export class FactoryProvider<T> extends ProviderBase<T> {
	private readonly _factory: Factory<T>;

	constructor(options: FactoryProviderOptions<T>) {
		super(options);
		const { useFactory } = options;

		this._factory = useFactory;
	}

	clone(): FactoryProvider<T> {
		return new FactoryProvider({
			lifecycle: this.lifecycle,
			useFactory: this._factory,
		});
	}

	resolve({ container, resolveContext }: ProviderResolveOptions): T {
		return this._factory(container, resolveContext);
	}
}
