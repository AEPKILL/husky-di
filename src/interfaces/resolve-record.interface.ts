/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 11:16:12
 */

import { ServiceIdentifier } from '../types/service-identifier.type';
import { IContainer } from './container.interface';

export interface IResolveMessageRecord {
  message: string;
}
export interface IResolveIdentifierRecord<T> {
  container: IContainer;
  serviceIdentifier: ServiceIdentifier<T>;
  resolveOptions?: HuskyDi.ResolveOptions<T>;
}

export type IResolveRecord<T> =
  | IResolveMessageRecord
  | IResolveIdentifierRecord<T>;
