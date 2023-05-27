/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 14:45:22
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import {
  IContainer,
  ResolveOptions,
  ResolveReturnType,
} from "@/interfaces/container.interface";
import { IDisposable } from "@/interfaces/disposable.interface";
import { IInternalContainer } from "@/interfaces/internal-container.interface";
import { IProvider } from "@/interfaces/provider.interface";
import { ClassProvider } from "@/providers/class.provider";
import { resolveRecordManagerRef } from "@/shared/instances";
import { Constructor } from "@/types/constructor.type";
import { Ref } from "@/types/ref.type";
import { ResolveContext } from "@/types/resolve-context.type";
import { ServiceIdentifier } from "@/types/service-identifier.type";
import { getResolveOptionKey } from "@/utils/container.utils";
import {
  applyProviderResolve,
  resetProvider,
  setProviderRegistered,
} from "@/utils/provider.utils";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";

import { InstanceDynamicRef } from "./instance-dynamic-ref";
import { InstanceRef } from "./instance-ref";
import { InstanceRefCount } from "./instance-ref-count";
import { Registry } from "./registry";

export class Container implements IInternalContainer {
  readonly name: string;
  readonly resolveContextRefs: InstanceRefCount<ResolveContext>;

  private readonly _registry = new Registry<IProvider<any>>();

  constructor(name: string) {
    this.name = name;
    this.resolveContextRefs = new InstanceRefCount<ResolveContext>(
      () => new Map()
    );
  }

  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): IDisposable {
    if (provider.registered) {
      throw new Error(`provider was already registered.`);
    }

    const providers = this._registry.getAll(serviceIdentifier);
    for (const it of providers) {
      // must be same lifecycle
      if (it.lifecycle !== provider.lifecycle) {
        throw new Error(
          `service identifier ${getServiceIdentifierName(
            serviceIdentifier
          )} all provider must have consistent lifecycle`
        );
      }
      // must be same accessibility
      if (it.isPrivate !== provider.isPrivate) {
        throw new Error(
          `service identifier"${getServiceIdentifierName(
            serviceIdentifier
          )}" all provider must have consistent accessibility`
        );
      }
    }

    this._registry.set(serviceIdentifier, provider);
    setProviderRegistered(provider, true);

    return {
      dispose: () => {
        const providers = this._registry.getAll(serviceIdentifier);
        this._registry.setAll(
          serviceIdentifier,
          providers.filter((it) => it !== provider)
        );
        resetProvider(provider);
      },
    };
  }

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
    return this._registry.has(serviceIdentifier);
  }

  getProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T> | null {
    return this._registry.get(serviceIdentifier);
  }

  getAllRegisteredServiceIdentifiers(): ServiceIdentifier<any>[] {
    return this._registry.keys();
  }

  getAllProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T>[] {
    return this._registry.getAll(serviceIdentifier);
  }

  resolve<T, Options extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options | undefined
  ): ResolveReturnType<T, Options> {
    const isRootResolveContext = this.resolveContextRefs.isNoRefs;
    const isRootResolveRecordManager = resolveRecordManagerRef.isNoRefs;
    const resolveContext = this.resolveContextRefs.useInstance();
    const resolveRecordManager = resolveRecordManagerRef.useInstance();
    const resolveRecordManagerSnapshot = resolveRecordManager.clone();
    const provider = this.getProvider(serviceIdentifier);
    const isRegistered = this.isRegistered(serviceIdentifier);
    const { ref, dynamic, multiple, optional, defaultValue } = options || {};

    let instances: T[] | Array<Ref<T>> | undefined;

    try {
      resolveRecordManager.pushResolveRecord({
        container: this,
        serviceIdentifier,
        resolveOptions: options,
      });

      // check options
      if (ref && dynamic) {
        throw resolveRecordManager.getResolveException(
          `ref and dynamic flag can't be true at the same time.`
        );
      }

      // check accessibility
      if (provider) {
        if (provider.isPrivate) {
          const parentRequestContainer =
            resolveRecordManager.getParentRequestContainer();
          if (parentRequestContainer !== this) {
            throw resolveRecordManager.getResolveException(
              `service identifier "${getServiceIdentifierName(
                serviceIdentifier
              )}" is private, only can be resolved in container "${this.name}".`
            );
          }
        }
      }

      // check cycle dependency
      const cycleResolveIdentifierRecord =
        resolveRecordManager.getCycleResolveIdentifierRecord();
      if (cycleResolveIdentifierRecord) {
        throw resolveRecordManager.getResolveException(
          `circular dependency detected, try use ref or dynamic flag.`,
          {
            cycleResolveIdentifierRecord,
          }
        );
      }

      // handle resolution scope lifecycle
      // only resolution lifecycle will cache instance in resolve context
      const resolutionCache = resolveContext.get(serviceIdentifier);
      if (resolutionCache) {
        const key = getResolveOptionKey(options || {});
        instances = resolutionCache.get(key);
        if (instances && instances.length) {
          if (multiple) {
            return instances as ResolveReturnType<T, Options>;
          } else {
            return instances[0] as ResolveReturnType<T, Options>;
          }
        }
      }

      // service identifier not registered and service identifier is a constructor
      // use temporary class provider to resolve
      if (!isRegistered) {
        if (typeof serviceIdentifier === "function") {
          instances = [
            new ClassProvider({
              useClass: serviceIdentifier as Constructor<T>,
            }).resolve(this, resolveContext) as T,
          ];
          if (multiple) {
            return instances as ResolveReturnType<T, Options>;
          } else {
            return instances[0] as ResolveReturnType<T, Options>;
          }
        }
      }

      // handle ref flag
      if (ref) {
        const resolveRecordManagerSnapshot = resolveRecordManager.clone();
        resolveRecordManagerSnapshot.pushResolveRecord({
          message: `"${getServiceIdentifierName(
            serviceIdentifier
          )}" is a ref value, wait for use`,
        });

        instances = [
          new InstanceRef(() => {
            resolveRecordManagerRef.$internal_setInstance(
              resolveRecordManagerSnapshot
            );
            this.resolveContextRefs.$internal_setInstance(resolveContext);
            return this.resolve(serviceIdentifier, {
              ...options,
              ref: false,
            });
          }),
        ];

        return instances as ResolveReturnType<T, Options>;
      }

      //  handle dynamic flag
      if (dynamic) {
        const resolveRecordManagerSnapshot = resolveRecordManager.clone();
        resolveRecordManagerSnapshot.pushResolveRecord({
          message: `"${getServiceIdentifierName(
            serviceIdentifier
          )}" is a dynamic value, wait for use`,
        });

        instances = [
          new InstanceDynamicRef(() => {
            resolveRecordManagerRef.$internal_setInstance(
              resolveRecordManagerSnapshot
            );
            this.resolveContextRefs.$internal_setInstance(resolveContext);
            return this.resolve(serviceIdentifier, {
              ...options,
              dynamic: false,
            });
          }),
        ];

        return instances as ResolveReturnType<T, Options>;
      }

      if (!isRegistered) {
        // handle optional flag
        if (optional) {
          return defaultValue as ResolveReturnType<T, Options>;
        }

        // not registered and not constructor, can't resolve it
        throw resolveRecordManager.getResolveException(
          `attempted to resolve unregistered dependency service identifier: "${getServiceIdentifierName(
            serviceIdentifier
          )}".`
        );
      }

      if (multiple) {
        instances = this.getAllProvider(serviceIdentifier).map((provider) => {
          return applyProviderResolve(provider, this, resolveContext);
        });

        return instances as ResolveReturnType<T, Options>;
      } else {
        instances = [applyProviderResolve(provider!, this, resolveContext)];

        return instances[0] as ResolveReturnType<T, Options>;
      }
    } finally {
      // check is need cache resolution result
      const shouldCacheInstances =
        provider?.lifecycle === LifecycleEnum.resolution &&
        instances &&
        instances.length;
      if (shouldCacheInstances) {
        const resolutionCache =
          resolveContext.get(serviceIdentifier) || new Map();
        resolutionCache.set(getResolveOptionKey(options || {}), instances);
        resolveContext.set(serviceIdentifier, resolutionCache);
      }

      this.resolveContextRefs.releaseInstance();
      resolveRecordManagerRef.releaseInstance();

      if (isRootResolveContext) {
        if (!this.resolveContextRefs.isNoRefs) {
          this.resolveContextRefs.reset();
          console.warn(`resolve context refs is not empty(#${this.name}).`);
        }
      }

      if (isRootResolveRecordManager) {
        if (!resolveRecordManagerRef.isNoRefs) {
          resolveRecordManagerRef.reset();
          console.warn(`resolve record manager refs is not empty.`);
        }
      } else {
        resolveRecordManagerRef.$internal_setInstance(
          resolveRecordManagerSnapshot
        );
      }
    }
  }

  static createContainer(
    name: string,
    register?: (container: IContainer) => void
  ): IContainer {
    const container = new this(name);

    if (register) {
      register(container);
    }

    return container;
  }
}
