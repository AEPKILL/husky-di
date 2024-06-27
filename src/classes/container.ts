/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 14:45:22
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { ClassProvider } from "@/providers/class.provider";
import { resolveRecordManagerRef } from "@/shared/instances";
import { setProviderInstance } from "@/utils/provider.utils";
import {
  getServiceIdentifierName,
  isServiceIdentifier
} from "@/utils/service-identifier.utils";

import { InstanceDynamicRef } from "./instance-dynamic-ref";
import { InstanceRef } from "./instance-ref";
import { InstanceRefCount } from "./instance-ref-count";
import { Registration } from "./registration";

import type {
  CreateChildContainerOptions,
  IContainer,
  IsRegisteredOptions,
  ResolveOptions,
  ResolveReturnType
} from "@/interfaces/container.interface";
import type { IInternalContainer } from "@/interfaces/internal-container.interface";
import type { IProvider } from "@/interfaces/provider.interface";
import type { Constructor } from "@/types/constructor.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { ResolveRecordManager } from "./resolve-record-manager";

export class Container extends Registration implements IInternalContainer {
  #parentContainer: IContainer | null = null;
  readonly name: string;
  readonly resolveContextRefs: InstanceRefCount<ResolveContext>;

  get parent(): IContainer | null {
    return this.#parentContainer;
  }

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

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;
  isRegistered<T>(options: IsRegisteredOptions<T>): boolean;
  isRegistered<T>(
    serviceIdentifierOrOptions: ServiceIdentifier<T> | IsRegisteredOptions<T>
  ): boolean {
    const options = isServiceIdentifier(serviceIdentifierOrOptions)
      ? {
          serviceIdentifier: serviceIdentifierOrOptions
        }
      : serviceIdentifierOrOptions;

    if (super.isRegistered(options)) return true;

    if (options.recursive && this.parent) {
      return this.parent.isRegistered(options);
    }

    return false;
  }

  createChildContainer(options: CreateChildContainerOptions): IContainer {
    const container = new Container(options.name);
    container.#parentContainer = this;
    return container;
  }

  hasChildContainer(container: IContainer): boolean {
    while (container.parent) {
      if (container.parent === this) {
        return true;
      }
      container = container.parent;
    }
    return false;
  }

  resolve<T, Options extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options | undefined
  ): ResolveReturnType<T, Options> {
    const { ref, dynamic, multiple, optional, defaultValue } = options || {};

    const providers = this.getAllProvider(serviceIdentifier);
    const provider = this.getProvider(serviceIdentifier);

    const isRegistered = this.isRegistered({
      serviceIdentifier,
      provider: provider || void 0
    });
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

      const registeredInCurrentContainer = this.isRegistered({
        serviceIdentifier,
        provider: provider || void 0
      });

      if (!registeredInCurrentContainer && this.parent) {
        const registeredInParentContainer = this.parent.isRegistered({
          serviceIdentifier,
          provider: provider || void 0,
          recursive: true
        });
        if (registeredInParentContainer) {
          resolveRecordManager.pushResolveRecord({
            message: `current container "${
              this.name
            }" not register service identifier "${getServiceIdentifierName(
              serviceIdentifier
            )}", try to resolve in parent container`
          });

          return this.parent.resolve(serviceIdentifier, options!);
        }
      }

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
