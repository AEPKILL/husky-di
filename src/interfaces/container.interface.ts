/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:21:27
 */

import type { Ref } from "@/types/ref.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type {
  IRegistration,
  IsRegisteredOptions as IRegistrationIsRegisteredOptions
} from "./registration.interface";
import { ResolveContext } from "@/types/resolve-context.type";
import { ResolveRecordManager } from "@/classes/resolve-record-manager";

export interface ResolveOptions<T> {
  dynamic?: boolean;
  multiple?: boolean;
  ref?: boolean;
  optional?: boolean;
  defaultValue?: T | T[];
}

export interface MiddlewareParams<T = any> {
  serviceIdentifier: ServiceIdentifier<T>;
  container: IContainer;
  resolveContext: ResolveContext;
  resolveRecordManager: ResolveRecordManager;
  resolveOptions?: ResolveOptions<T>;
}

export type Middleware = (
  next: (params: MiddlewareParams) => unknown
) => (params: MiddlewareParams) => unknown;

export type CreateChildContainerOptions = {
  name: string;
};

export type RefType<T, Options extends ResolveOptions<T>> = Options extends
  | { dynamic: true }
  | { ref: true }
  ? Ref<T>
  : T;

export type ResolveReturnType<
  T,
  Options extends ResolveOptions<T>
> = Options extends { multiple: true }
  ? RefType<T, Options>[]
  : RefType<T, Options>;

export type IsRegisteredOptions<T> = IRegistrationIsRegisteredOptions<T> & {
  /**
   * Whether to check recursively in the parent container.
   * @default false
   */
  recursive?: boolean;
};

export interface IContainer extends Omit<IRegistration, "isRegistered"> {
  readonly name: string;
  readonly parent: IContainer | null;

  addMiddleware(middleware: Middleware): () => void;

  createChildContainer(options: CreateChildContainerOptions): IContainer;
  hasChildContainer(container: IContainer): boolean;
  resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
  resolve<T, Options extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options: Options
  ): ResolveReturnType<T, Options>;

  isRegistered<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: IsRegisteredOptions<T>
  ): boolean;
}
