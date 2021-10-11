/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:20:39
 */

import { LifecycleEnum } from '../enums/lifecycle.enum';
import { ResolveContext } from '../types/resolve-context.type';
import { IContainer } from './container.interface';

export interface ProviderOptions {
  lifecycle?: LifecycleEnum;
}

export interface IProvider<T> {
  readonly lifecycle: LifecycleEnum;
  readonly instance: T | undefined;
  root: IProvider<T>;
  clone(): IProvider<T>;
  resolve(container: IContainer, resolveContext: ResolveContext): T;

  clearInstance(): void;

  /**
   * 同一个 provider 的不同 clone 备份，视为相等
   */
  equal(provider: IProvider<T>): boolean;
}
