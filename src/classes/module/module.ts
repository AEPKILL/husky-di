/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 09:22:57
 */

import { createContainer } from '../..';
import { IContainer } from '../../interfaces/container.interface';
import { IProvider } from '../../interfaces/provider.interface';
import { Constructor } from '../../types/constructor.type';
import { ServiceIdentifier } from '../../types/service-identifier.type';

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

export class Module {
  _imports: Module[];
  _providers: ProviderDeclare[];
  _exports: ServiceIdentifier<any>[];
  _name: string;

  constructor(options: ModuleOptions) {
    const { name, imports, providers, exports } = options;

    this._name = name;
    this._imports = imports?.slice() || [];
    this._providers = providers.slice() || [];
    this._exports = exports.slice() || [];
  }

  createContainer(): IContainer {
    return createContainer(`$${this._name}`, container => {
      const exportsSet = new Set(this._exports);
    });
  }
}
