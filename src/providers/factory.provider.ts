/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from '../classes/base/provider.base';
import { LifecycleEnum } from '../enums/lifecycle.enum';
import { IContainer } from '../interfaces/container.interface';
import { ProviderOptions } from '../interfaces/provider.interface';
import { ResolveContext } from '../types/resolve-context.type';

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
    return this._setRealRoot(
      new FactoryProvider({
        lifecycle: this.lifecycle,
        useFactory: this._factory,
      }) as this
    );
  }

  resolve(container: IContainer, resolveContext: ResolveContext): T {
    if (this._instance !== void 0) {
      return this._instance;
    }

    try {
      const value = this._factory(container, resolveContext);
      if (this.lifecycle === LifecycleEnum.singleton) {
        this._instance = value;
      }
      return value;
    } catch (error) {
      throw resolveContext.resolveRecord.getResolveException(
        `factory function execute exception: ${(error as Error)?.message}`
      );
    }
  }
}
