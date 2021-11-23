/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-23 11:27:56
 */

import { ResolveRecordManager } from '../classes/resolve-record-manager';
import { IContainer } from '../interfaces/container.interface';
import { ResolveContext } from '../types/resolve-context.type';
import { getResolveContextRef } from './helpers/container.helper';
import { resolveRecordManagerRef } from './instances';

export interface PreInstallContextOptions<R> {
  resolveContext?: ResolveContext;
  resolveRecordManager?: ResolveRecordManager;
  container: IContainer;
  callback(options: Required<Omit<PreInstallContextOptions<R>, 'callback'>>): R;
}
export function runResolveZone<R>(options: PreInstallContextOptions<R>) {
  let { resolveContext, resolveRecordManager } = options;

  const { callback, container } = options;
  const resolveContextRef = getResolveContextRef(container);
  const isContainerRootRequest = resolveContextRef.refsCount === 0;
  const isRootRequest = resolveRecordManagerRef.refsCount === 0;

  resolveContext = resolveContextRef.getInstance(resolveContext);
  resolveRecordManager = resolveRecordManagerRef.getInstance(
    resolveRecordManager
  );

  const resolveRecordBackup = resolveRecordManager.clone();

  try {
    return callback({
      resolveContext,
      resolveRecordManager: resolveRecordManager,
      container,
    });
  } finally {
    resolveContextRef.releaseInstance();
    resolveRecordManagerRef.releaseInstance();

    if (resolveRecordManagerRef.refsCount !== 0) {
      resolveRecordManagerRef.$internal_setInstance(resolveRecordBackup);
    }

    if (isContainerRootRequest && resolveContextRef.refsCount !== 0) {
      resolveContextRef.reset();
      throw new Error(`${container.name} resolve context ref count mismatch!`);
    }

    if (isRootRequest && resolveRecordManagerRef.refsCount !== 0) {
      resolveRecordManagerRef.reset();
      throw new Error(`resolve record ref count mismatch!`);
    }
  }
}
