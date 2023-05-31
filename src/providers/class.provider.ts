/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 13:53:22
 */

import { ProviderBase } from '@/classes/base/provider.base';
import { injectionMetadataMap } from '@/shared/instances';
import { getServiceIdentifierName } from '@/utils/service-identifier.utils';

import type { IContainer } from "@/interfaces/container.interface";
import type { ProviderOptions } from "@/interfaces/provider.interface";
import type { Constructor } from "@/types/constructor.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ResolveRecordManager } from "@/classes/resolve-record-manager";
export interface ClassProviderOptions<T> extends ProviderOptions {
  useClass: Constructor<T>;
}

export class ClassProvider<T> extends ProviderBase<T> {
  private readonly _classConstructor: Constructor<T>;

  constructor(options: ClassProviderOptions<T>) {
    super(options);
    this._classConstructor = options.useClass;
  }

  resolve(
    container: IContainer,
    _resolveContext: ResolveContext,
    resolveRecordManager: ResolveRecordManager
  ): T {
    const parametersMetadata = injectionMetadataMap.get(this._classConstructor);
    if (!parametersMetadata) {
      throw resolveRecordManager.getResolveException(
        `service identifier "${getServiceIdentifierName(
          this._classConstructor
        )}" can't be resolved, please use '@injectable' decorate it`
      );
    }

    const parameter = parametersMetadata.map((it, index) => {
      resolveRecordManager.pushResolveRecord({
        message: `resolve parameter #${index} of constructor ${this._classConstructor.name}`,
      });
      return container.resolve(it.serviceIdentifier, it);
    });

    try {
      return new this._classConstructor(...parameter);
    } catch (error) {
      throw resolveRecordManager.getResolveException(
        `try create "${this._classConstructor.name}" instance fail: ${
          (error as any)?.message || "unknown"
        }`,
        {
          exception: error as Error,
        }
      );
    }
  }

  clone(): this {
    return new ClassProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useClass: this._classConstructor,
    }) as this;
  }
}
