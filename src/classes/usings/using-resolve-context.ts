/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 10:04:50
 */

import { IContainer } from '../../interfaces/container.interface';
import { IUsing } from '../../interfaces/using.interface';
import { getResolveContextRef } from '../../shared/helpers/container.helper';
import { ResolveContext } from '../../types/resolve-context.type';
import { UsingBase } from '../base/using.base';
import { InstanceRefCount } from '../instance-ref-count';

export class UsingResolveContext extends UsingBase<ResolveContext>
  implements IUsing<ResolveContext> {
  private _resolveContext?: ResolveContext;
  private _resolveContextRef?: InstanceRefCount<ResolveContext>;
  private _isContainerRootRequest: boolean;
  private _container: IContainer;

  constructor(container: IContainer, resolveContext?: ResolveContext) {
    super();
    this._container = container;
    this._resolveContext = resolveContext;
    this._isContainerRootRequest = false;
  }

  get(): ResolveContext {
    if (this._disposed) {
      throw new Error(
        `UsingResolveContext was already disposed(#${this._container.name})`
      );
    }

    if (this._resolved) {
      return this._current!;
    }

    this._resolveContextRef = getResolveContextRef(this._container);

    this._isContainerRootRequest = this._resolveContextRef.isRoot;

    this._current = this._resolveContextRef.getInstance(this._resolveContext);
    this._resolved = true;

    return this._current;
  }

  dispose(): void {
    if (this._resolved && !this._disposed) {
      this._resolveContextRef!.releaseInstance();

      const isResolveContextRefDirty =
        this._isContainerRootRequest && !this._resolveContextRef!.isRoot;
      if (isResolveContextRefDirty) {
        this._resolveContextRef!.reset();
        throw new Error(
          `resolveContextRef is dirty (#${this._container.name})`
        );
      }
    }
    this._disposed = true;
  }
}
