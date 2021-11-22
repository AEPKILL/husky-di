/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:22:05
 */

import { ServiceIdentifier } from './service-identifier.type';

export type ResolveContext = Map<ServiceIdentifier<any>, Map<string, any>>;
