/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 14:45:22
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { ClassProvider } from "@/providers/class.provider";
import { resolveRecordManagerRef } from "@/shared/instances";
import { setProviderInstance } from "@/utils/provider.utils";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";

import { InstanceDynamicRef } from "./instance-dynamic-ref";
import { InstanceRef } from "./instance-ref";
import { InstanceRefCount } from "./instance-ref-count";

import type {
  IContainer,
  ResolveOptions,
  ResolveReturnType
} from "@/interfaces/container.interface";
import type { IInternalContainer } from "@/interfaces/internal-container.interface";
import type { IProvider } from "@/interfaces/provider.interface";
import type { Constructor } from "@/types/constructor.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { ResolveRecordManager } from "./resolve-record-manager";
import { Registration } from "./registration";
export class Container extends Registration implements IInternalContainer {
  readonly name: string;
  readonly resolveContextRefs: InstanceRefCount<ResolveContext>;

  constructor(name: string) {
    super();
    this.name = name;
    this.resolveContextRefs = new InstanceRefCount<ResolveContext>(
      `ResolveContext(#${this.name})`,
      () => {
        return new Map();
      }
    );
  }

  resolve<T, Options extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options | undefined
  ): ResolveReturnType<T, Options> {
    const { ref, dynamic, multiple, optional, defaultValue } = options || {};

    const providers = this.getAllProvider(serviceIdentifier);
    const provider = this.getProvider(serviceIdentifier);

    const isRegistered = this.isRegistered(serviceIdentifier);
    const isRootResolveContext = this.resolveContextRefs.isNoRefs;
    const isRootResolveRecordManager = resolveRecordManagerRef.isNoRefs;

    const resolveContext = this.resolveContextRefs.useInstance();
    const resolveRecordManager = resolveRecordManagerRef.useInstance();

    const resolveRecordStackSnapshot =
      resolveRecordManager.getResolveRecordStack();

    try {
      resolveRecordManager.pushResolveRecord({
        container: this,
        serviceIdentifier,
        resolveOptions: options
      });

      // check options
      if (ref && dynamic) {
        throw resolveRecordManager.getResolveException(
          `ref and dynamic flag can't be true at the same time`
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
              )}" is private, can only be resolved within the container "${
                this.name
              }"`
            );
          }
        }
      }

      // check cycle dependency
      const cycleResolveIdentifierRecord =
        resolveRecordManager.getCycleResolveIdentifierRecord();
      if (cycleResolveIdentifierRecord) {
        throw resolveRecordManager.getResolveException(
          `circular dependency detected, try use ref or dynamic flag`,
          {
            cycleResolveIdentifierRecord
          }
        );
      }

      // service identifier not registered and service identifier is a constructor
      // use temporary class provider to resolve
      if (!isRegistered) {
        if (typeof serviceIdentifier === "function") {
          try {
            resolveRecordManager.pushResolveRecord({
              message: `service identifier "${getServiceIdentifierName(
                serviceIdentifier
              )}" is not registered, but it is a constructor, use temporary class provider to resolve`
            });
            const instance = new ClassProvider({
              useClass: serviceIdentifier as Constructor<T>
            }).resolve({
              container: this,
              resolveContext,
              resolveRecordManager
            });
            return (multiple ? [instance] : instance) as ResolveReturnType<
              T,
              Options
            >;
          } catch (e: any) {
            throw resolveRecordManager.getResolveException(e.message, {
              exception: e
            });
          }
        }
      }

      // handle ref flag
      if (ref) {
        const refResolveRecordManagerSnapshot = resolveRecordManager.clone();
        refResolveRecordManagerSnapshot.pushResolveRecord({
          message: `"${getServiceIdentifierName(
            serviceIdentifier
          )}" is a ref value, wait for use`
        });

        return new InstanceRef(() => {
          resolveRecordManagerRef.$internal_setInstance(
            refResolveRecordManagerSnapshot
          );
          this.resolveContextRefs.$internal_setInstance(resolveContext);
          return this.resolve(serviceIdentifier, {
            ...options,
            ref: false
          });
        }) as ResolveReturnType<T, Options>;
      }

      //  handle dynamic flag
      if (dynamic) {
        const dynamicResolveRecordManagerSnapshot =
          resolveRecordManager.clone();
        dynamicResolveRecordManagerSnapshot.pushResolveRecord({
          message: `"${getServiceIdentifierName(
            serviceIdentifier
          )}" is a dynamic value, wait for use`
        });

        return new InstanceDynamicRef(() => {
          resolveRecordManagerRef.$internal_setInstance(
            dynamicResolveRecordManagerSnapshot
          );
          this.resolveContextRefs.$internal_setInstance(resolveContext);
          return this.resolve(serviceIdentifier, {
            ...options,
            dynamic: false
          });
        }) as ResolveReturnType<T, Options>;
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
          )}"`
        );
      }

      if (multiple) {
        return providers.map((provider) => {
          return this._applyProviderResolve(
            resolveContext,
            resolveRecordManager,
            provider,
            this
          );
        }) as ResolveReturnType<T, Options>;
      } else {
        return this._applyProviderResolve(
          resolveContext,
          resolveRecordManager,
          provider!,
          this
        ) as ResolveReturnType<T, Options>;
      }
    } finally {
      this.resolveContextRefs.releaseInstance();
      resolveRecordManagerRef.releaseInstance();

      if (isRootResolveContext) {
        if (!this.resolveContextRefs.isNoRefs) {
          this.resolveContextRefs.reset();
          console.warn(`resolve context refs is not empty(#${this.name})`);
        }
      }

      if (isRootResolveRecordManager) {
        if (!resolveRecordManagerRef.isNoRefs) {
          resolveRecordManagerRef.reset();
          console.warn(`resolve record manager refs is not empty`);
        }
      } else {
        resolveRecordManager.restore(resolveRecordStackSnapshot);
      }
    }
  }

  private _applyProviderResolve<T>(
    resolveContext: ResolveContext,
    resolveRecordManager: ResolveRecordManager,
    provider: IProvider<T>,
    container: IContainer
  ): T {
    if (provider.resolved) {
      return provider.instance!;
    }

    if (resolveContext.has(provider)) {
      return resolveContext.get(provider)!;
    }

    const instance = provider.resolve({
      container,
      resolveContext,
      resolveRecordManager
    });

    switch (provider.lifecycle) {
      case LifecycleEnum.singleton: {
        setProviderInstance(provider, instance);
        break;
      }
      case LifecycleEnum.resolution: {
        resolveContext.set(provider, instance);
        break;
      }
    }

    return instance;
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
