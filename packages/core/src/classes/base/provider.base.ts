/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:17:24
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";

import type {
	IInternalProvider,
	IProvider,
	ProviderOptions,
	ProviderResolveOptions,
} from "@/interfaces/provider.interface";

export abstract class ProviderBase<T> implements IInternalProvider<T> {
	private _instance: T | undefined;
	private _resolved: boolean;
	private _registered: boolean;
	private _lifecycle: LifecycleEnum;

	get instance(): T | undefined {
		return this._instance;
	}
	get resolved(): boolean {
		return this._resolved;
	}
	get registered(): boolean {
		return this._registered;
	}

	get lifecycle(): LifecycleEnum {
		return this._lifecycle;
	}

	constructor(options: ProviderOptions) {
		const { lifecycle = LifecycleEnum.transient } = options;
		this._resolved = false;
		this._registered = false;
		this._lifecycle = lifecycle;
	}

	abstract clone(): IProvider<T>;
	abstract resolve(options: ProviderResolveOptions): T;

	setInstance(instance: T): void {
		this._instance = instance;
	}
	setResolved(resolved: boolean): void {
		this._resolved = resolved;
	}
	setRegistered(registered: boolean): void {
		this._registered = registered;
	}
}
