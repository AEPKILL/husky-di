/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-26 09:54:36
 */

import {
  IContainer,
  ResolveReturnType,
} from '../../interfaces/container.interface';
import { IProvider } from '../../interfaces/provider.interface';
import { ServiceIdentifier } from '../../types/service-identifier.type';
import { Container } from '../container';

export interface ProviderDeclareStatement {
  serviceIdentifier: ServiceIdentifier<any>;
  provider: IProvider<any> | IProvider<any>[];
}

export type ProviderDeclare = ProviderDeclareStatement | Constructor<any>;

export interface ModuleOptions {
  name: string;
  imports?: Module[];
  providers: ProviderDeclare[];
  exports: ServiceIdentifier<any>[];
}

export class ModuleContainer implements Pick<IContainer, 'name' | 'resolve'> {
  private _container: Container;

  readonly name: string;

  constructor(name: string) {
    this.name = `$${name}`;
  }
  resolve<T, Options extends HuskyDi.ResolveOptions<T>>(
    serviceIdentifier: ServiceIdentifier<T>,
    options?: Options
  ): ResolveReturnType<T, Options> {
    throw new Error('Method not implemented.');
  }
}
