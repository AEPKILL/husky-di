/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 10:09:18
 */

import { IUsing } from '../../interfaces/using.interface';
import { resolveRecordManagerRef } from '../../shared/instances';
import { UsingBase } from '../base/using.base';
import { ResolveRecordManager } from '../resolve-record-manager';

export class UsingResolveRecordManager extends UsingBase<ResolveRecordManager>
  implements IUsing<ResolveRecordManager> {
  private _resolveRecordManager?: ResolveRecordManager;
  private _backup?: ResolveRecordManager;
  private _isRootRequest: boolean;

  constructor(resolveRecordManager?: ResolveRecordManager) {
    super();

    this._resolveRecordManager = resolveRecordManager;
    this._isRootRequest = false;
  }

  get(): ResolveRecordManager {
    if (this._disposed) {
      throw new Error(`UsingResolveRecordManager was already disposed`);
    }

    if (this._resolved) {
      return this._current!;
    }

    this._isRootRequest = resolveRecordManagerRef.isNoRefs;
    this._current = resolveRecordManagerRef.getInstance(
      this._resolveRecordManager
    );
    this._backup = this._current.clone();
    this._resolved = true;

    return this._current;
  }

  dispose(): void {
    if (this._resolved && !this._disposed) {
      resolveRecordManagerRef.releaseInstance();

      //  如果是非 RootRequest 结束后要丢弃掉添加的解析记录
      if (!this._isRootRequest) {
        resolveRecordManagerRef.$internal_setInstance(this._backup!);
      }

      const isResolveManagerDirty =
        this._isRootRequest && !resolveRecordManagerRef.isNoRefs;

      if (isResolveManagerDirty) {
        const rootRequestContainer = this._current!.getRootRequestContainer();
        const rootContainerDisplayName = rootRequestContainer
          ? `(#${rootRequestContainer.name})`
          : '';

        resolveRecordManagerRef.reset();

        throw this._current!.getResolveException(
          `resolveRecordManagerRef is dirty${rootContainerDisplayName}`
        );
      }
    }
    this._disposed = true;
  }
}
