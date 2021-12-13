/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-23 10:43:50
 */

import { Container } from '../../classes/container';
import { InstanceRefCount } from '../../classes/instance-ref-count';
import { IContainer } from '../../interfaces/container.interface';
import { ResolveContext } from '../../types/resolve-context.type';

export function getResolveContextRef(
  container: IContainer
): InstanceRefCount<ResolveContext> {
  return (container as Container)._resolveContextRef;
}
