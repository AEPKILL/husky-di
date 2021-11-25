/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from '../classes/base/provider.base';
import { UsingResolveContext } from '../classes/usings/using-resolve-context';
import { UsingResolveRecordManager } from '../classes/usings/using-resolve-record-manager';
import { IContainer } from '../interfaces/container.interface';
import { ProviderOptions } from '../interfaces/provider.interface';
import { using } from '../shared/using';
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
    return new FactoryProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useFactory: this._factory,
    }) as this;
  }

  resolve(container: IContainer, resolveContext: ResolveContext): T {
    return using(
      new UsingResolveContext(container, resolveContext),
      new UsingResolveRecordManager()
    )((_resolveContext, resolveRecordManager) => {
      try {
        return this._factory(container, resolveContext);
      } catch (error) {
        throw resolveRecordManager.getResolveException(
          `factory function execute exception: ${(error as Error)?.message ||
            'unknown'}.`,
          {
            exception: error as Error,
          }
        );
      }
    });
  }
}
