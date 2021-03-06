/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:21:27
 */

import { Middleware, RemoveMiddleware } from '../classes/middleware-manager';
import { Ref } from '../types/ref.type';
import { ResolveContext } from '../types/resolve-context.type';
import { ServiceIdentifier } from '../types/service-identifier.type';
import { IProvider } from './provider.interface';

export type UnRegister = () => void;

export type ContainerMiddlewareArgs<T> = {
  container: IContainer;
  resolveContext: ResolveContext;
  metadata: HuskyDi.InjectionMetadata<T>;
};

export type ContainerMiddleware<T> = Middleware<ContainerMiddlewareArgs<T>, T>;

export type ResolveReturnType<
  T,
  Options extends HuskyDi.ResolveOptions<T>
> = Options extends { multiple: true }
  ? Options extends { dynamic: true }
    ? Ref<T[]>
    : Options extends { ref: true }
    ? Ref<T[]>
    : T[]
  : Options extends { dynamic: true }
  ? Ref<T>
  : Options extends { ref: true }
  ? Ref<T>
  : T;

export type ContainerMiddlewareNext = <T>(
  next: ContainerMiddleware<T>
) => ContainerMiddleware<T>;

export interface IContainer {
  readonly name: string;

  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): UnRegister;

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;

  getProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T> | null;

  getAllRegisteredServiceIdentifiers(): ServiceIdentifier<any>[];

  getAllProvider<T>(
    serviceIdentifier: ServiceIdentifier<T>
  ): Array<IProvider<T>>;

  unRegister<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider?: IProvider<T>
  ): void;

  resolve<T, Options extends HuskyDi.ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options
  ): ResolveReturnType<T, Options>;

  addMiddleware(middleware: ContainerMiddlewareNext): RemoveMiddleware;
}
