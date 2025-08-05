/**
 * @overview 容器实现类
 * @author AEPKILL
 * @created 2025-07-29 22:30:35
 */

import { DisposableRegistry } from "@/classes/DisposableRegistry";
import { InstanceDynamicRef } from "@/classes/InstanceDynamicRef";
import { InstanceRef } from "@/classes/InstanceRef";
import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import { ResolveException } from "@/exceptions/resolve.exception";
import { Disposable } from "@/impls/Disposable";
import { MiddlewareChain } from "@/impls/MiddlewareChain";
import { Registration } from "@/impls/Registration";
import { Registry } from "@/impls/Registry";
import type {
	IContainer,
	IInternalContainer,
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddleware,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type {
	CreateAliasRegistrationOptions,
	CreateClassRegistrationOptions,
	CreateFactoryRegistrationOptions,
	CreateRegistrationOptions,
	CreateValueRegistrationOptions,
	IInternalRegistration,
} from "@/interfaces/registration.interface";
import { globalMiddleware } from "@/shared/instances";
import type { Constructor } from "@/types/constructor.type";
import type { MutableRef, Ref } from "@/types/ref.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { createAssertNotDisposed } from "@/utils/disposable.utils";
import {
	getEnsureResolveRecord,
	resetResolveRecord,
	setResolveRecord,
} from "@/utils/resolve-record.utils";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";
import { createContainerId } from "@/utils/uuid.utils";

const assertNotDisposed = createAssertNotDisposed("Container");

/**
 * 依赖注入容器实现类
 * 提供服务的注册、解析和管理功能
 */
export class Container extends Disposable implements IInternalContainer {
	public readonly id: string;

	public get name(): string {
		return this._name;
	}

	public get displayName(): string {
		return `${this.name}#${this.id}`;
	}

	public get parent(): IContainer | undefined {
		return this._parent;
	}

	public get resolveContext(): MutableRef<ResolveContext> {
		return this._resolveContext;
	}

	private readonly _registry: Registry;

	private readonly _parent?: IContainer;

	private readonly _name: string;

	private readonly _disposableRegistry: DisposableRegistry;

	private readonly _resolveContext: MutableRef<ResolveContext>;

	/**
	 * 解析中间件链
	 */
	private readonly _resolveMiddlewareChain: MiddlewareChain<
		ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
		// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
		any
	>;

	/**
	 * 构造函数
	 * @param name 容器名称
	 */
	constructor(name: string = "DefaultContainer", parent?: IContainer) {
		super(() => {
			this._disposableRegistry.dispose();
			this._registry.clear();
		});

		this.id = createContainerId();
		this._name = name;
		this._registry = new Registry();
		this._parent = parent;

		// 初始化默认的解析中间件链
		this._resolveMiddlewareChain = new MiddlewareChain(
			(params) => {
				return this._resolveRegistration(params);
			},
			globalMiddleware,
			[],
		);

		this._disposableRegistry = new DisposableRegistry();
		this._resolveContext = {};

		this._disposableRegistry.addDisposable(this._resolveMiddlewareChain);
	}

	/**
	 * 解析服务实例
	 * @param serviceIdentifier 服务标识符
	 * @param resolveOptions 解析选项
	 * @returns 服务实例
	 */
	public resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: O,
	): ResolveInstance<T, O> {
		assertNotDisposed(this);

		const resolveRecord = getEnsureResolveRecord(this);
		const resolveContext = this._getResolveContext();
		const resolveOptions = options || ({} as ResolveOptions<T>);
		const { dynamic, ref, multiple, optional, defaultValue } = resolveOptions;
		const registrations = this._registry.getAll(serviceIdentifier);
		const current = resolveRecord.current;

		try {
			if (dynamic && ref) {
				throw new ResolveException(
					`Cannot use both "dynamic" and "ref" options simultaneously for service identifier "${getServiceIdentifierName(serviceIdentifier)}". These options are mutually exclusive. Please choose either "dynamic" or "ref", but not both.`,
					resolveRecord,
				);
			}

			resolveRecord.addRecordNode({
				type: ResolveIdentifierRecordTypeEnum.serviceIdentifier,
				resolveOptions,
				serviceIdentifier,
				container: this,
			});

			const cycleNodeInfo = resolveRecord.getCycleNodes();
			if (cycleNodeInfo) {
				throw new ResolveException(
					`Circular dependency detected for service identifier "${getServiceIdentifierName(serviceIdentifier)}". To resolve this, use either the "ref" option to get a reference to the service or the "dynamic" option to defer resolution until the service is actually used.`,
					resolveRecord,
				);
			}

			if (registrations.length === 0) {
				if (
					this._parent?.isRegistered(serviceIdentifier, { recursive: true })
				) {
					resolveRecord.addRecordNode({
						type: ResolveIdentifierRecordTypeEnum.message,
						message: `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not registered in "${this.displayName}", but found in parent container. Resolving from parent container.`,
					});

					return this._parent.resolve(
						serviceIdentifier,
						resolveOptions,
					) as ResolveInstance<T, O>;
				}

				if (typeof serviceIdentifier === "function") {
					resolveRecord.addRecordNode({
						type: ResolveIdentifierRecordTypeEnum.message,
						message: `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not registered in "${this.displayName}", but it is a class constructor. Auto-registering as transient service.`,
					});

					return this._resolveInternal({
						container: this,
						serviceIdentifier,
						resolveOptions,
						registration: new Registration({
							lifecycle: LifecycleEnum.transient,
							useClass: serviceIdentifier as Constructor<T>,
						}),
						resolveContext,
						resolveRecord,
					}) as ResolveInstance<T, O>;
				}

				if (optional) {
					return defaultValue as ResolveInstance<T, O>;
				}

				throw new Error(
					`Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not registered in this container. Please register it first using container.register() or set the "optional" option to true if this service is optional.`,
				);
			}

			if (multiple) {
				const instances = registrations.map((registration) => {
					return this._resolveInternal({
						container: this,
						serviceIdentifier,
						resolveOptions,
						registration,
						resolveContext,
						resolveRecord,
					}) as ResolveInstance<T, O>;
				});

				return instances as ResolveInstance<T, O>;
			} else {
				return this._resolveInternal({
					container: this,
					serviceIdentifier,
					resolveOptions,
					registration: registrations[registrations.length - 1],
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
			} else {
				resolveRecord.setCurrent(current);
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
	public isRegistered<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: IsRegisteredOptions,
	): boolean {
		assertNotDisposed(this);

		const { recursive = false } = options || {};

		if (this._registry.has(serviceIdentifier)) {
			return true;
		}

		if (recursive && this._parent) {
			return this._parent.isRegistered(serviceIdentifier, options);
		}

		return false;
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
	public use(
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
	public unused(
		// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
		middleware: ResolveMiddleware<any, any>,
	): void {
		assertNotDisposed(this);

		this._resolveMiddlewareChain.unused(middleware);
	}

	/**
	 * 获取所有已注册的服务标识符
	 * @returns 服务标识符数组
	 */
	public getServiceIdentifiers(): ServiceIdentifier<unknown>[] {
		return this._registry.keys();
	}

	/**
	 * 内部解析方法
	 * @param serviceIdentifier 服务标识符
	 * @param resolveOptions 解析选项
	 * @returns 服务实例
	 */
	private _resolveInternal<T, O extends ResolveOptions<T>>(
		params: ResolveMiddlewareParams<T, O>,
	): T | Ref<T> {
		const {
			serviceIdentifier,
			resolveRecord,
			registration,
			resolveContext,
			resolveOptions,
		} = params;

		const { ref, dynamic } = resolveOptions;

		if (ref) {
			resolveRecord.addRecordNode({
				type: ResolveIdentifierRecordTypeEnum.message,
				message: `Service Identifier "${getServiceIdentifierName(serviceIdentifier)}" is resolved as a ref`,
			});
			const resolveContext = this._resolveContext.current;
			return new InstanceRef<T>(() => {
				this._resolveContext.current = resolveContext;
				setResolveRecord(resolveRecord);
				return this.resolve(serviceIdentifier, resolveOptions) as T;
			});
		}

		if (dynamic) {
			resolveRecord.addRecordNode({
				type: ResolveIdentifierRecordTypeEnum.message,
				message: `Service Identifier "${getServiceIdentifierName(serviceIdentifier)}" is resolved as a dynamic ref`,
			});
			const resolveContext = this._resolveContext.current;
			return new InstanceDynamicRef<T>(() => {
				this._resolveContext.current = resolveContext;
				setResolveRecord(resolveRecord);
				return this.resolve(serviceIdentifier, {
					...resolveOptions,
					multiple: false,
					dynamic: false,
				} as ResolveOptions<T>) as T;
			});
		}

		const isSingleton = registration.lifecycle === LifecycleEnum.singleton;
		if (isSingleton) {
			if (registration.resolved) {
				return registration.instance as T;
			}
		}

		const isResolution = registration.lifecycle === LifecycleEnum.resolution;
		if (isResolution) {
			if (resolveContext.has(registration)) {
				return resolveContext.get(registration) as T;
			}
		}

		const instance = this._resolveMiddlewareChain.execute(params);

		if (isSingleton) {
			(registration as IInternalRegistration<T>).setInstance(instance);
		} else if (isResolution) {
			resolveContext.set(registration, instance);
		}

		return instance;
	}

	/**
	 * 解析服务实例
	 * @param params 解析参数
	 * @returns 服务实例
	 */
	private _resolveRegistration<T, O extends ResolveOptions<T>>(
		params: ResolveMiddlewareParams<T, O>,
	): T {
		const {
			resolveOptions,
			resolveRecord,
			registration,
			container,
			resolveContext,
		} = params;
		let instance: T;
		resolveRecord.stashCurrent();
		switch (registration.type) {
			case RegistrationTypeEnum.class: {
				const provider =
					registration.provider as CreateClassRegistrationOptions<T>["useClass"];
				instance = new provider();
				break;
			}
			case RegistrationTypeEnum.value:
				return registration.provider as CreateValueRegistrationOptions<T>["useValue"];
			case RegistrationTypeEnum.factory: {
				const provider =
					registration.provider as CreateFactoryRegistrationOptions<T>["useFactory"];
				instance = provider(container, resolveContext);
				break;
			}
			case RegistrationTypeEnum.alias: {
				const provider =
					registration.provider as CreateAliasRegistrationOptions<T>["useAlias"];
				instance = container.resolve(provider, resolveOptions) as T;
				break;
			}
			default:
				throw new Error(`Unsupported registration type: ${registration.type}`);
		}
		resolveRecord.restoreCurrent();
		return instance;
	}

	private _getResolveContext(): ResolveContext {
		if (!this._resolveContext.current) {
			this._resolveContext.current = new Map();
		}
		return this._resolveContext.current;
	}

	static rootContainer: IContainer = new Container("Root");
}
