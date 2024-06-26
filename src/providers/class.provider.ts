/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 13:53:22
 */

import { ProviderBase } from "@/classes/base/provider.base";
import { injectionMetadataMap } from "@/shared/instances";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";

import type {
  ProviderOptions,
  ProviderResolveOptions
} from "@/interfaces/provider.interface";
import type { Constructor } from "@/types/constructor.type";
import type { InjectionMetadata } from "@/types/injection-metadata.type";

export interface ClassProviderOptions<T> extends ProviderOptions {
  useClass: Constructor<T>;
}

export class ClassProvider<T> extends ProviderBase<T> {
  private readonly _classConstructor: Constructor<T>;
  private readonly _parametersMetadata: Array<InjectionMetadata<T>>;

  constructor(options: ClassProviderOptions<T>) {
    super(options);
    this._classConstructor = options.useClass;
    this._parametersMetadata = injectionMetadataMap.get(this._classConstructor);
    if (!this._parametersMetadata) {
      throw new Error(
        `constructor "${getServiceIdentifierName(
          this._classConstructor
        )}" can't be resolved, please use '@injectable()' decorate it`
      );
    }
  }

  resolve({ container, resolveRecordManager }: ProviderResolveOptions): T {
    const parameter = this._parametersMetadata.map((it, index) => {
      resolveRecordManager.pushResolveRecord({
        message: `resolve parameter #${index} of constructor ${this._classConstructor.name}`
      });

      const value = container.resolve(it.serviceIdentifier, it);

      resolveRecordManager.popResolveRecord();

      return value;
    });

    try {
      return new this._classConstructor(...parameter);
    } catch (error) {
      throw resolveRecordManager.getResolveException(
        `try create "${this._classConstructor.name}" instance fail: ${
          (error as any)?.message || "unknown"
        }`,
        {
          exception: error as Error
        }
      );
    }
  }

  clone(): this {
    return new ClassProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useClass: this._classConstructor
    }) as this;
  }
}
