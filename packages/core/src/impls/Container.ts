/**
 * @overview 容器实现类
 * @author AEPKILL
 * @created 2025-07-29 22:30:35
 */

import { DisposableRegistry } from "@/classes/DisposableRegistry";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import { MiddlewareChain } from "@/impls/MiddlewareChain";
import type {
	IInternalContainer,
	ResolveInstance,
	ResolveMiddleware,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { Middleware } from "@/interfaces/middleware-chain.interface";
import type { CreateRegistrationOptions } from "@/interfaces/registration.interface";
import type { Ref } from "@/types/ref.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { createAssertNotDisposed } from "@/utils/disposable.utils";
import { createContainerId } from "@/utils/uuid.utils";
import { Registration } from "./Registration";
import { Registry } from "./Registry";

const assertNotDisposed = createAssertNotDisposed("Container");

/**
 * 依赖注入容器实现类
 * 提供服务的注册、解析和管理功能
 */
export class Container implements IInternalContainer {
	/**
	 * 容器唯一标识符
	 */
	public readonly id: string;

	/**
	 * 容器名称
	 */
	public readonly name: string;

	/**
	 * 容器显示名称
	 */
	public readonly displayName: string;

	/**
	 * 是否已销毁
	 */
	private _disposed: boolean = false;

	/**
	 * 服务注册表
	 */
	private readonly _registry: Registry;

	private readonly _disposableRegistry: DisposableRegistry;

	/**
	 * 解析中间件链
	 */
	private readonly _resolveMiddlewareChain: MiddlewareChain<
		{
			serviceIdentifier: ServiceIdentifier<unknown>;
			resolveOptions: ResolveOptions<unknown>;
		},
		unknown
	>;

	/**
	 * 构造函数
	 * @param name 容器名称
	 */
	constructor(name: string = "DefaultContainer") {
		this.id = createContainerId();
		this.name = name;
		this.displayName = `Container(${name})`;
		this._registry = new Registry();

		// 初始化默认的解析中间件链
		this._resolveMiddlewareChain = new MiddlewareChain((params) => {
			return this._resolveInternal(
				params.serviceIdentifier,
				params.resolveOptions,
			);
		});

		this._disposableRegistry = new DisposableRegistry();
	}

	/**
	 * 获取是否已销毁
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * 解析服务实例
	 * @param serviceIdentifier 服务标识符
	 * @param resolveOptions 解析选项
	 * @returns 服务实例
	 */
	public resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		resolveOptions: O,
	): ResolveInstance<T, O> {
		assertNotDisposed(this);

		return this._resolveMiddlewareChain.execute({
			serviceIdentifier,
			resolveOptions,
		}) as ResolveInstance<T, O>;
	}

	/**
	 * 注册服务
	 * @param serviceIdentifier 服务标识符
	 * @param registration 注册选项
	 */
	public register<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: CreateRegistrationOptions<T>,
	): void {
		assertNotDisposed(this);

		const registrationInstance = new Registration<T>(registration);
		this._registry.set(serviceIdentifier, registrationInstance);
	}

	/**
	 * 检查服务是否已注册
	 * @param serviceIdentifier 服务标识符
	 * @returns 是否已注册
	 */
	public isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
		return this._registry.has(serviceIdentifier);
	}

	/**
	 * 取消注册服务
	 * @param serviceIdentifier 服务标识符
	 */
	public unregister<T>(serviceIdentifier: ServiceIdentifier<T>): void {
		assertNotDisposed(this);

		this._registry.remove(serviceIdentifier);
	}

	/**
	 * 添加解析中间件
	 * @param middleware 中间件
	 */
	public addMiddleware<T, O extends ResolveOptions<T>>(
		middleware: ResolveMiddleware<T, O>,
	): void {
		assertNotDisposed(this);

		// 类型转换以兼容中间件链的泛型类型
		const genericMiddleware: Middleware<
			{
				serviceIdentifier: ServiceIdentifier<unknown>;
				resolveOptions: ResolveOptions<unknown>;
			},
			unknown
		> = {
			name: middleware.name,
			executor: (params, next) => {
				return middleware.executor(
					params as {
						serviceIdentifier: ServiceIdentifier<T>;
						resolveOptions: O;
					},
					next as any,
				);
			},
		};

		this._resolveMiddlewareChain.use(genericMiddleware);
	}

	/**
	 * 移除解析中间件
	 * @param middleware 中间件
	 */
	public removeMiddleware<T, O extends ResolveOptions<T>>(
		middleware: ResolveMiddleware<T, O>,
	): void {
		assertNotDisposed(this);

		// 类型转换以兼容中间件链的泛型类型
		const genericMiddleware: Middleware<
			{
				serviceIdentifier: ServiceIdentifier<unknown>;
				resolveOptions: ResolveOptions<unknown>;
			},
			unknown
		> = {
			name: middleware.name,
			executor: (params, next) => {
				return middleware.executor(
					params as {
						serviceIdentifier: ServiceIdentifier<T>;
						resolveOptions: O;
					},
					next as any,
				);
			},
		};

		this._resolveMiddlewareChain.unused(genericMiddleware);
	}

	/**
	 * 销毁容器
	 */
	public dispose(): void {
		assertNotDisposed(this);

		this._disposableRegistry.dispose();
		this._registry.clear();
	}

	/**
	 * 内部解析方法
	 * @param serviceIdentifier 服务标识符
	 * @param resolveOptions 解析选项
	 * @returns 服务实例
	 */
	private _resolveInternal<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		resolveOptions: ResolveOptions<T>,
	): T | T[] | undefined | Ref<T> {
		const registration = this._registry.get(serviceIdentifier);
		if (!registration) {
			if (resolveOptions.optional) {
				return resolveOptions.defaultValue as T | T[] | undefined;
			}
			throw new Error(`服务 ${String(serviceIdentifier)} 未注册`);
		}

		// 处理多个实例的情况
		if (resolveOptions.multiple) {
			const allRegistrations = this._registry.getAll(serviceIdentifier);
			const instances = allRegistrations.map((reg) =>
				this._createInstance(reg),
			);

			if (resolveOptions.optional && instances.length === 0) {
				return (resolveOptions.defaultValue as T[]) || [];
			}

			const result = instances as T[];
			return resolveOptions.ref || resolveOptions.dynamic
				? ({ current: result, resolved: true } as Ref<T>)
				: result;
		}

		// 处理单个实例的情况
		const instance = this._createInstance(registration);

		if (resolveOptions.optional && instance === undefined) {
			return resolveOptions.defaultValue as T | undefined;
		}

		const result = instance as T;
		return resolveOptions.ref || resolveOptions.dynamic
			? ({ current: result, resolved: true } as Ref<T>)
			: result;
	}

	/**
	 * 创建服务实例
	 * @param registration 注册信息
	 * @returns 服务实例
	 */
	private _createInstance<T>(registration: Registration<T>): T {
		// 如果已经解析过且是单例，直接返回实例
		if (registration.resolved && registration.instance !== undefined) {
			return registration.instance;
		}

		let instance: T;

		switch (registration.type) {
			case RegistrationTypeEnum.class: {
				// 构造函数类型
				const Constructor = registration.provider as new (
					...args: unknown[]
				) => T;
				instance = new Constructor();
				break;
			}

			case RegistrationTypeEnum.factory: {
				// 工厂函数类型
				const factory = registration.provider as (
					container: IInternalContainer,
					context: ResolveContext,
				) => T;
				const context = new Map();
				instance = factory(this, context);
				break;
			}

			case RegistrationTypeEnum.value: {
				// 值类型
				instance = registration.provider as T;
				break;
			}

			case RegistrationTypeEnum.alias: {
				// 别名类型
				const aliasIdentifier = registration.provider as ServiceIdentifier<T>;
				instance = this.resolve(aliasIdentifier, {});
				break;
			}

			default:
				throw new Error(`不支持的注册类型: ${registration.type}`);
		}

		// 设置实例和解析状态
		registration.setInstance(instance);
		registration.setResolved(true);

		return instance;
	}
}
