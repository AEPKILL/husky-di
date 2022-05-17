/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:31:53
 */
import {
  ContainerMiddlewareArgs,
  ContainerMiddlewareNext,
  IContainer,
  ResolveReturnType,
  UnRegister,
} from '../interfaces/container.interface';
import { IProvider } from '../interfaces/provider.interface';
import { constructorMiddleware } from '../middleware/constructor.middleware';
import { resolutionScopedMiddleware } from '../middleware/resolution-scoped.middleware';
import { defaultMiddleware } from '../middleware/default.middleware';
import { optionalMiddleware } from '../middleware/optional.middleware';
import { refMiddleware } from '../middleware/ref.middleware';
import { ServiceIdentifier } from '../types/service-identifier.type';
import {
  MiddlewareManager,
  MiddlewareNext,
  RemoveMiddleware,
} from './middleware-manager';
import { Registry } from './registry';
import { InstanceRefCount } from './instance-ref-count';
import { createResolveContext } from '../factory/create-resolve-context.factory';
import { using } from '../shared/using';
import { UsingResolveContext } from './usings/using-resolve-context';
import { UsingResolveRecordManager } from './usings/using-resolve-record-manager';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { dynamicMiddleware } from '../middleware/dynamic.middleware';

export class Container implements IContainer {
  /**
   * @deprecated internal use, don't access it
   */
  _resolveContextRef = new InstanceRefCount(createResolveContext);
  private readonly _registry = new Registry<IProvider<any>>();
  private readonly _name: string;
  private readonly _middlewareManager = new MiddlewareManager<
    ContainerMiddlewareArgs<any>,
    any
  >(defaultMiddleware);

  get name() {
    return this._name;
  }

  constructor(name: string) {
    this._name = name;

    this.addMiddleware(constructorMiddleware);
    this.addMiddleware(refMiddleware);
    this.addMiddleware(dynamicMiddleware);
    this.addMiddleware(optionalMiddleware);
    this.addMiddleware(resolutionScopedMiddleware);

    for (const middleware of Container.middlewares) {
      this.addMiddleware(middleware);
    }
  }

  addMiddleware(
    middleware: MiddlewareNext<ContainerMiddlewareArgs<any>, any>
  ): RemoveMiddleware {
    return this._middlewareManager.add(middleware);
  }

  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): UnRegister {
    const providers = this._registry.getAll(serviceIdentifier);

    for (const it of providers) {
      if (it.lifecycle !== provider.lifecycle) {
        throw new Error(
          `${serviceIdentifier.toString()} all provider must have consistent lifecycle`
        );
      }
      if (it.isPrivate !== provider.isPrivate) {
        throw new Error(
          `${serviceIdentifier.toString()} all provider must have consistent accessibility`
        );
      }
    }

    const cloneProvider = provider.derivation();

    if (!cloneProvider.equal(provider) || cloneProvider === provider) {
      throw new Error(`this provider "clone" method incorrect`);
    }

    this._registry.set(serviceIdentifier, cloneProvider);

    return () => {
      this.unRegister(serviceIdentifier, cloneProvider);
    };
  }

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
    return this._registry.has(serviceIdentifier);
  }

  getProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T> | null {
    return this._registry.get(serviceIdentifier);
  }

  getAllProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T>[] {
    return this._registry.getAll(serviceIdentifier);
  }

  getAllRegisteredServiceIdentifiers(): ServiceIdentifier<any>[] {
    return this._registry.keys();
  }

  unRegister<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider?: IProvider<T>
  ) {
    if (provider) {
      const providers = this._registry.getAll(serviceIdentifier);

      this._registry.setAll(
        serviceIdentifier,
        providers.filter(it => !it.equal(provider))
      );
    } else {
      this._registry.setAll(serviceIdentifier, []);
    }
  }

  resolve<T, Options extends HuskyDi.ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options
  ): ResolveReturnType<T, Options> {
    const container = this;

    return using(
      new UsingResolveContext(container),
      new UsingResolveRecordManager()
    )((resolveContext, resolveRecordManager) => {
      // 添加一条引用记录
      resolveRecordManager.pushResolveRecord({
        container,
        serviceIdentifier,
        resolveOptions: options,
      });

      // 检查一下 options
      const { ref, dynamic } = options || {};
      if (ref && dynamic) {
        throw resolveRecordManager.getResolveException(
          "`dynamic` and `ref` can't be used together"
        );
      }

      // 检查一下是否是私有的 serviceIdentifier
      // 私有的 serviceIdentifier 仅允许容器内引用
      if (this.isRegistered(serviceIdentifier)) {
        const provider = this.getProvider(serviceIdentifier)!;
        if (provider.isPrivate) {
          const parentRequestContainer = resolveRecordManager.getParentRequestContainer();
          if (parentRequestContainer !== this) {
            throw resolveRecordManager.getResolveException(
              `service identifier: "${getServiceIdentifierName(
                serviceIdentifier
              )}" is private`
            );
          }
        }
      }

      // 检查是否有循环依赖
      const cycleResolveIdentifierRecord = resolveRecordManager.getCycleResolveIdentifierRecord();
      if (cycleResolveIdentifierRecord) {
        throw resolveRecordManager.getResolveException(
          `circular dependency detected! try use ref flag or dynamic flag`,
          {
            cycleResolveIdentifierRecord,
          }
        );
      }

      // 交给 Middleware 去解析
      return this._middlewareManager.invoke!({
        resolveContext,
        container,
        metadata: {
          ...options,
          serviceIdentifier,
        },
      }) as ResolveReturnType<T, Options>;
    });
  }

  static readonly middlewares: ContainerMiddlewareNext[] = [];
}
