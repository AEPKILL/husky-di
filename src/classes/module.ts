/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 09:22:57
 */

import { IProvider } from '../interfaces/provider.interface';
import { ServiceIdentifier } from '../types/service-identifier.type';

export interface ServiceDeclareStatement {
  serviceIdentifier: ServiceIdentifier<any>;
  provider: IProvider<any> | IProvider<any>[];
}

export interface ModuleOptions {
  imports?: Module[];
  declarations?: ServiceDeclareStatement;
  exports: ServiceIdentifier<any>[];
}

export class Module {}

