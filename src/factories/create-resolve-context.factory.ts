/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-19 11:13:30
 */

import { ResolveContext } from '../types/resolve-context.type';

export function createResolveContext(): ResolveContext {
  const resolveContext = (new Map() as unknown) as ResolveContext;

  return resolveContext;
}
