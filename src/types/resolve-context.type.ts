/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:22:05
 */

import { ResolveLogger } from '../classes/resolve-logger';
import { ServiceIdentifier } from './service-identifier.type';

export type ResolveContext = Map<ServiceIdentifier<any>, any> & {
  readonly resolveLogger: ResolveLogger;
};
