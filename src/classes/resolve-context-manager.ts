/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:28:42
 */

import { ResolveContext } from '../types/resolve-context.type';
import { ResolveRecord } from './resolve-record';

export class ResolveContextManager {
  private _resolveContext?: ResolveContext;
  private _resolveContextRefCount = 0;

  get resolveContextRefCount() {
    return this._resolveContextRefCount;
  }

  getResolveContext(context?: ResolveContext): ResolveContext {
    if (this._resolveContext === undefined) {
      if (context) {
        return (this._resolveContext = context);
      }

      const resolveContext = (new Map() as unknown) as Writable<ResolveContext>;
      resolveContext.resolveRecord = new ResolveRecord();
      this._resolveContext = resolveContext as ResolveContext;
    }

    this._resolveContextRefCount++;

    return this._resolveContext;
  }

  popResolveContext(): void {
    this._resolveContextRefCount--;
    if (this._resolveContextRefCount === 0) {
      this._resolveContext = undefined;
    }
  }
}
