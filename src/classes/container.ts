/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:31:53
 */
import {
  ContainerMiddlewareArgs,
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

export class Container implements IContainer {
  /**
   * @deprecated internal use, don't access it
   */
  $internal_resolveContextRef = new InstanceRefCount(createResolveContext);
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
    this.addMiddleware(optionalMiddleware);
    this.addMiddleware(resolutionScopedMiddleware);
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
    return using(
      new UsingResolveContext(this),
      new UsingResolveRecordManager()
    )((resolveContext, resolveRecordManager) => {
      resolveRecordManager.pushResolveRecord({
        container: this,
        serviceIdentifier,
        resolveOptions: options,
      });

      // check cycle reference
      const cycleResolveIdentifierRecord = resolveRecordManager.getCycleResolveIdentifierRecord();
      if (cycleResolveIdentifierRecord) {
        throw resolveRecordManager.getResolveException(
          `circular dependency detected! try use ref.`,
          {
            cycleResolveIdentifierRecord,
          }
        );
      }

      return this._middlewareManager.invoke!({
        resolveContext,
        container: this,
        metadata: {
          ...options,
          serviceIdentifier,
        },
      }) as ResolveReturnType<T, Options>;
    });
  }
}
