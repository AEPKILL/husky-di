/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 09:22:57
 */

import { IContainer } from '../interfaces/container.interface';
import { IProvider } from '../interfaces/provider.interface';
import { ServiceIdentifier } from '../types/service-identifier.type';

export interface ServiceStatement {
  serviceIdentifier: ServiceIdentifier<any>;
  provider: IProvider<any> | IProvider<any>[];
}

export interface ModuleOptions {
  import?: Module[];
  export: ServiceStatement[];
}

export class Module {
  private _boundContainers: IContainer[] = [];
  private _import?: Module[];
  private _export: ServiceStatement[];

  constructor(options: ModuleOptions) {
    // shallow copy
    this._export = options.export.slice();
    if (options.import) {
      this._import = options.import.slice();
    }
  }

  bind(container: IContainer) {
    if (this._wasBindWithContainer(container)) {
      throw new Error(`module was already bind to this container`);
    }

    if (this._import) {
      this._import.forEach(module => {
        module.bind(container);
      });
    }

    for (const statement of this._export) {
      if (Array.isArray(statement.provider)) {
        statement.provider.forEach(it =>
          container.register(statement.serviceIdentifier, it)
        );
      } else {
        container.register(statement.serviceIdentifier, statement.provider);
      }
    }

    this._boundContainers.push(container);
  }

  unbind(container: IContainer) {
    if (!this._wasBindWithContainer(container)) {
      throw new Error(`module was not bind to this container`);
    }

    if (this._import) {
      this._import.forEach(module => {
        module.unbind(container);
      });
    }

    for (const statement of this._export) {
      if (Array.isArray(statement.provider)) {
        statement.provider.forEach(it =>
          container.unRegister(statement.serviceIdentifier, it)
        );
      } else {
        container.unRegister(statement.serviceIdentifier, statement.provider);
      }
    }

    this._boundContainers = this._boundContainers.filter(
      it => it !== container
    );
  }

  private _wasBindWithContainer(container: IContainer): boolean {
    return this._boundContainers.find(it => it === container) !== void 0;
  }
}
