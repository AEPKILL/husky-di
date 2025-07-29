/**
 * @overview 容器实现类
 * @author AEPKILL
 * @created 2025-07-29 22:30:35
 */

import { DisposableRegistry } from "@/classes/DisposableRegistry";
import { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import { MiddlewareChain } from "@/impls/MiddlewareChain";
import type {
	IInternalContainer,
	ResolveInstance,
	ResolveMiddleware,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type {
	CreateRegistrationOptions,
	IRegistration,
} from "@/interfaces/registration.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { Optional } from "@/types/optional.type";
import type { MutableRef, Ref } from "@/types/ref.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { createAssertNotDisposed } from "@/utils/disposable.utils";
import {
	getEnsureResolveRecord,
	resetResolveRecord,
} from "@/utils/resolve-record.utils";
import { createContainerId } from "@/utils/uuid.utils";
import { Registration } from "./Registration";
import { Registry } from "./Registry";

const assertNotDisposed = createAssertNotDisposed("Container");

/**
 * 依赖注入容器实现类
 * 提供服务的注册、解析和管理功能
 */
export class Container implements IInternalContainer {
	public readonly id: string;

	public get name(): string {
		return this._name;
	}

	public get displayName(): string {
		return `${this.name}#${this.id}`;
	}

	public get resolveContext(): MutableRef<ResolveContext> {
		return this._resolveContext;
	}

	private _disposed: boolean = false;

	private readonly _registry: Registry;

	private readonly _name: string;

	private readonly _disposableRegistry: DisposableRegistry;

	private readonly _resolveContext: MutableRef<ResolveContext>;

	/**
	 * 解析中间件链
	 */
	private readonly _resolveMiddlewareChain: MiddlewareChain<
		{
			serviceIdentifier: ServiceIdentifier<unknown>;
			resolveOptions: ResolveOptions<unknown>;
			registration: IRegistration<unknown>;
			resolveContext: ResolveContext;
			resolveRecord: IInternalResolveRecord;
		},
		// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
		any
	>;

	/**
	 * 构造函数
	 * @param name 容器名称
	 */
	constructor(name: string = "DefaultContainer") {
		this.id = createContainerId();
		this._name = name;
		this._registry = new Registry();

		// 初始化默认的解析中间件链
		this._resolveMiddlewareChain = new MiddlewareChain((params) => {
			return this._resolveInternal(params);
		});

		this._disposableRegistry = new DisposableRegistry();
		this._resolveContext = {};
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
		options: O,
	): ResolveInstance<T, O> {
		assertNotDisposed(this);

		const resolveRecord = getEnsureResolveRecord(this);
		const resolveContext = this._getResolveContext();
		const { multiple } = options;

		try {
			if (multiple) {
				const registrations = this._registry.getAll(serviceIdentifier);
				const instances = registrations.map((registration) => {
					return this._resolveInternal({
						serviceIdentifier,
						resolveOptions: options,
						registration,
						resolveContext,
						resolveRecord,
					}) as ResolveInstance<T, O>;
				});

				return instances as ResolveInstance<T, O>;
			} else {
				const registration = this._registry.get(serviceIdentifier);
				return this._resolveInternal({
					serviceIdentifier,
					resolveOptions: options,
					registration,
					resolveContext,
					resolveRecord,
				}) as ResolveInstance<T, O>;
			}
		} finally {
			const isRootResolveRecord =
				resolveRecord.current.value.type ===
				ResolveIdentifierRecordTypeEnum.root;
			if (isRootResolveRecord) {
				resetResolveRecord();
				this.resolveContext.current = undefined;
			}
		}
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
	public addMiddleware(
		// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
		middleware: ResolveMiddleware<any, any>,
	): void {
		assertNotDisposed(this);
		this._resolveMiddlewareChain.use(middleware);
	}

	/**
	 * 移除解析中间件
	 * @param middleware 中间件
	 */
	public removeMiddleware(
		// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
		middleware: ResolveMiddleware<any, any>,
	): void {
		assertNotDisposed(this);
		this._resolveMiddlewareChain.unused(middleware);
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
	private _resolveInternal<T, O extends ResolveOptions<T>>(
		params: Optional<ResolveMiddlewareParams<T, O>, "registration">,
	): T | Ref<T> {
		console.log(params);
		throw new Error("Not implemented");
	}

	private _getResolveContext(): ResolveContext {
		if (!this._resolveContext.current) {
			this._resolveContext.current = new Map();
		}
		return this._resolveContext.current;
	}
}
