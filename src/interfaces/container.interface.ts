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

export type ResolveOptions<T> = {
  dynamic?: boolean;
  multiple?: boolean;
  ref?: boolean;
  optional?: boolean;
  defaultValue?: T | T[];
};

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
  createChildContainer(options: CreateChildContainerOptions): IContainer;
  hasChildContainer(container: IContainer): boolean;
  resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
  resolve<T, Options extends ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options: Options
  ): ResolveReturnType<T, Options>;

  isRegistered<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;
  isRegistered<T>(options: IsRegisteredOptions<T>): boolean;
}
