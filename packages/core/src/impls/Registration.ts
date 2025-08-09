/**
 * @overview 注册类实现
 * @author AEPKILL
 * @created 2025-07-29 22:27:57
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type { IDisplayName } from "@/interfaces/display-name.interface";
import type {
	CreateRegistrationOptions,
	IInternalRegistration,
	IRegistration,
} from "@/interfaces/registration.interface";
import { createRegistrationId } from "@/utils/uuid.utils";

export class Registration<T> implements IInternalRegistration<T>, IDisplayName {
	/**
	 * 唯一标识符
	 */
	public readonly id: string;

	/**
	 * 注册类型
	 */
	public readonly type: RegistrationTypeEnum;

	/**
	 * 生命周期
	 */
	public readonly lifecycle: LifecycleEnum;

	/**
	 * 实例对象
	 */
	private _instance: T | undefined;

	/**
	 * 是否已解析
	 */
	private _resolved: boolean = false;

	/**
	 * 提供者（构造函数、工厂函数、值或别名）
	 */
	public readonly provider: IRegistration<T>["provider"];

	/**
	 * 容器引用
	 */
	public readonly getContainer?: () => IContainer;

	/**
	 * 显示名称
	 */
	public get displayName(): string {
		return this.id;
	}

	/**
	 * 额外属性存储
	 */
	private readonly _extras = new Map<string | symbol, unknown>();

	/**
	 * 构造函数
	 * @param options 注册选项
	 */
	constructor(options: CreateRegistrationOptions<T>) {
		this.id = createRegistrationId();

		// 确定注册类型和提供者
		if ("useClass" in options) {
			this.type = RegistrationTypeEnum.class;
			this.provider = options.useClass;
			this.lifecycle = options.lifecycle ?? LifecycleEnum.transient;
		} else if ("useFactory" in options) {
			this.type = RegistrationTypeEnum.factory;
			this.provider = options.useFactory;
			this.lifecycle = options.lifecycle ?? LifecycleEnum.transient;
		} else if ("useValue" in options) {
			this.type = RegistrationTypeEnum.value;
			this.provider = options.useValue;
			this.lifecycle = options.lifecycle ?? LifecycleEnum.transient;
		} else if ("useAlias" in options) {
			this.type = RegistrationTypeEnum.alias;
			this.provider = options.useAlias;
			this.lifecycle = LifecycleEnum.transient; // 别名类型默认为 transient
			this.getContainer = options.getContainer;
		} else {
			throw new Error("Unsupported registration options");
		}

		// 如果是值类型，直接设置实例
		if (this.type === RegistrationTypeEnum.value) {
			this._instance = this.provider as T;
			this._resolved = true;
		}
	}

	/**
	 * 获取实例
	 */
	public get instance(): T | undefined {
		return this._instance;
	}

	/**
	 * 获取是否已解析
	 */
	public get resolved(): boolean {
		return this._resolved;
	}

	/**
	 * 设置是否已解析
	 * @param resolved 是否已解析
	 */
	public setResolved(resolved: boolean): void {
		this._resolved = resolved;
	}

	/**
	 * 设置实例
	 * @param instance 实例对象
	 */
	public setInstance(instance: T): void {
		this._instance = instance;
	}

	/**
	 * 获取额外属性
	 * @param key 属性键
	 * @returns 属性值
	 */
	public getExtra<T>(key: string | symbol): T | undefined {
		return this._extras.get(key) as T | undefined;
	}

	/**
	 * 设置额外属性
	 * @param key 属性键
	 * @param value 属性值
	 */
	public setExtra<T>(key: string | symbol, value: T): void {
		this._extras.set(key, value);
	}

	/**
	 * 删除额外属性
	 * @param key 属性键
	 */
	public deleteExtra(key: string | symbol): void {
		this._extras.delete(key);
	}

	/**
	 * 获取所有额外属性的键
	 * @returns 属性键数组
	 */
	public getExtraKeys(): Array<string | symbol> {
		return Array.from(this._extras.keys());
	}
}
