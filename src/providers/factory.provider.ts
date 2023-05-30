/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from "../classes/base/provider.base";
import { IContainer } from "../interfaces/container.interface";
import { ProviderOptions } from "../interfaces/provider.interface";
import { ResolveContext } from "../types/resolve-context.type";
import { resolveRecordManagerRef } from "@/shared/instances";

export type Factory<T> = (
  container: IContainer,
  resolveContext: ResolveContext
) => T;
export interface FactoryProviderOptions<T> extends ProviderOptions {
  useFactory: Factory<T>;
}

export class FactoryProvider<T> extends ProviderBase<T> {
  private readonly _factory: Factory<T>;

  constructor(options: FactoryProviderOptions<T>) {
    super(options);
    const { useFactory } = options;

    this._factory = useFactory;
  }

  clone(): this {
    return new FactoryProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useFactory: this._factory,
    }) as this;
  }

  resolve(container: IContainer, resolveContext: ResolveContext): T {
    const resolveRecordManager = resolveRecordManagerRef.instance;

    if (!resolveRecordManager) {
      throw new Error(
        "can't invoke resolve method outside of container resolve"
      );
    }

    try {
      return this._factory(container, resolveContext);
    } catch (error) {
      throw resolveRecordManager.getResolveException(
        `factory function execute exception: ${
          (error as Error)?.message || "unknown"
        }`,
        {
          exception: error as Error,
        }
      );
    }
  }
}
