/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from '../classes/base/provider.base';
import { Middleware } from '../classes/middleware-manager';
import { UsingResolveContext } from '../classes/usings/using-resolve-context';
import { UsingResolveRecordManager } from '../classes/usings/using-resolve-record-manager';
import { IContainer } from '../interfaces/container.interface';
import { ProviderOptions } from '../interfaces/provider.interface';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { injectionMetadataMap } from '../shared/instances';
import { using } from '../shared/using';
import { Constructor } from '../types/constructor.type';
import { ResolveContext } from '../types/resolve-context.type';

export type ClassMiddlewareArgs = {};
export type ClassMiddleware = Middleware<ClassMiddlewareArgs, any>;

export interface ClassProviderOptions<T> extends ProviderOptions {
  useClass: Constructor<T>;
}

export class ClassProvider<T> extends ProviderBase<T> {
  private readonly _constructor: Constructor<T>;

  constructor(options: ClassProviderOptions<T>) {
    super(options);
    const { useClass } = options;

    this._constructor = useClass;
  }

  clone(): this {
    return new ClassProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useClass: this._constructor,
    }) as this;
  }

  resolve(container: IContainer, resolveContext: ResolveContext): T {
    return using(
      new UsingResolveContext(container, resolveContext),
      new UsingResolveRecordManager()
    )((_resolveContext, resolveRecordManager) => {
      const parametersMetadata = injectionMetadataMap.get(
        this._constructor
      );

      if (!parametersMetadata) {
        throw new Error(
          `service identifier "${getServiceIdentifierName(
            this._constructor
          )}" can't resolve, please use '@injectable' decorate it`
        );
      }

      if (parametersMetadata.length === 0) {
        try {
          return new this._constructor();
        } catch (error) {
          throw resolveRecordManager.getResolveException(
            `try create "${
              this._constructor.name
            }" instance fail: ${(error as any)?.message || 'unknown'}`,
            {
              exception: error as Error,
            }
          );
        }
      } else {
        const length = this._constructor.length;
        if (parametersMetadata.length !== length) {
          throw resolveRecordManager.getResolveException(
            `${this._constructor.name} parameters metadata mismatch`
          );
        }

        const parameters = parametersMetadata.map((it, index) => {
          resolveRecordManager.pushResolveRecord({
            message: `resolve parameter #${index} of constructor ${this._constructor.name}`,
          });
          return container.resolve(it.serviceIdentifier, it);
        });

        return new this._constructor(...parameters);
      }
    });
  }
}
