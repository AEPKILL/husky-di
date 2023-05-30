/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:21:27
 */

import type { Ref } from '@/types/ref.type';
import type { ServiceIdentifier } from '@/types/service-identifier.type';
import type { IDisposable } from './disposable.interface';
import type { IProvider } from './provider.interface';

export type ResolveOptions<T> = {
  dynamic?: boolean;
  multiple?: boolean;
  ref?: boolean;
  optional?: boolean;
  defaultValue?: T | T[];
};

export type ResolveReturnType<
  T,
  Options extends ResolveOptions<T>
> = Options extends { multiple: true }
  ? Options extends { dynamic: true } | { ref: true }
    ? Ref<T[]>
    : T[]
  : Options extends { dynamic: true } | { ref: true }
  ? Ref<T>
  : T;

export interface IContainer {
  readonly name: string;

  register<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    provider: IProvider<T>
  ): IDisposable;

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;

  getProvider<T>(serviceIdentifier: ServiceIdentifier<T>): IProvider<T> | null;

  getAllRegisteredServiceIdentifiers(): ServiceIdentifier<any>[];

  getAllProvider<T>(
    serviceIdentifier: ServiceIdentifier<T>
  ): Array<IProvider<T>>;

  resolve<T, Options extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options
  ): ResolveReturnType<T, Options>;
}
