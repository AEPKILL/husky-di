/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 11:21:00
 */

import {
  IResolveIdentifierRecord,
  IResolveRecord,
} from '../interfaces/resolve-record.interface';
import { generateStringsIndent } from '../shared/helpers/string.helper';
import {
  getResolveIdentifierRecordName,
  isEqualResolveRecord,
  isResolveIdentifierRecord,
} from '../shared/helpers/resolve-record.helper';
import { DerivationBase } from './base/derivation.base';
import { ResolveException } from '../exceptions/resolve.exception';
import { IContainer } from '../interfaces/container.interface';

export interface GetResolveExceptionOptions {
  exception?: Error;
  cycleResolveIdentifierRecord?: IResolveIdentifierRecord<any> | null;
}

export class ResolveRecordManager extends DerivationBase {
  private _recordStack: IResolveRecord<any>[] = [];

  get recordCount() {
    return this._recordStack.length;
  }

  pushResolveRecord(resolveRecord: IResolveRecord<any>) {
    this._recordStack.push(resolveRecord);
  }

  popResolveRecord() {
    this._recordStack.pop();
  }

  getResolveException(
    message?: string,
    options: GetResolveExceptionOptions = {}
  ) {
    const { cycleResolveIdentifierRecord, exception } = options;

    /**
     * when exception is ResolveException, keep origin exception instance
     */
    if (ResolveException.isResolveException(exception)) {
      return exception;
    }

    if (message) {
      this.pushResolveRecord({ message });
    }

    return new ResolveException(
      this.getResolveMessage(cycleResolveIdentifierRecord)
    );
  }

  getResolveMessage(
    cycleResolveIdentifierRecord?: IResolveIdentifierRecord<any> | null
  ): string {
    const resolveIdentifierRecordMessage = this.getResolveIdentifierRecords()
      .map(it => {
        let message = getResolveIdentifierRecordName(it);

        // 给循环引用的节点加个标记
        const isCycleNode =
          cycleResolveIdentifierRecord &&
          isEqualResolveRecord(it, cycleResolveIdentifierRecord);
        if (isCycleNode) {
          message = `(( ${message} ))`;
        }

        return message;
      })
      .join(' -> ');

    // console.log(this.getResolveMessages());

    return `${resolveIdentifierRecordMessage}\n${generateStringsIndent(
      this.getResolveMessages()
    )}`;
  }

  getParentRequestContainer(): IContainer | null {
    if (!this._recordStack.length) {
      return null;
    }

    // containers[0] is current container
    // containers[1] is parent container
    const containers: IContainer[] = [];

    for (let i = this._recordStack.length - 1; i >= 0; i--) {
      const it = this._recordStack[i];
      if (isResolveIdentifierRecord(it)) {
        containers.push(it.container);
      }
      if (containers.length === 2) {
        break;
      }
    }

    return containers[1] || null;
  }

  getRootRequestContainer(): IContainer | null {
    for (let i = 0; i < this._recordStack.length; i++) {
      const it = this._recordStack[i];

      if (isResolveIdentifierRecord(it)) {
        return it.container;
      }
    }
    return null;
  }

  getCycleResolveIdentifierRecord(): null | IResolveIdentifierRecord<any> {
    if (this._recordStack.length < 2) {
      return null;
    }

    // only check latest resolve record
    const latestResolveRecord = this._recordStack[this._recordStack.length - 1];

    if (!isResolveIdentifierRecord(latestResolveRecord)) {
      return null;
    }

    if (latestResolveRecord.resolveOptions?.ref) {
      return null;
    }

    if (latestResolveRecord.resolveOptions?.dynamic) {
      return null;
    }

    for (let i = this._recordStack.length - 2; i >= 0; i--) {
      const it = this._recordStack[i];

      if (!isResolveIdentifierRecord(it)) {
        continue;
      }

      if (it.resolveOptions?.ref) {
        break;
      }

      if (it.resolveOptions?.dynamic) {
        break;
      }

      if (isEqualResolveRecord(latestResolveRecord, it)) {
        return latestResolveRecord;
      }
    }

    return null;
  }

  getResolveIdentifierRecords(): IResolveIdentifierRecord<any>[] {
    return this._recordStack.filter(it =>
      isResolveIdentifierRecord(it)
    ) as IResolveIdentifierRecord<any>[];
  }

  getResolveMessages(): string[] {
    return this._recordStack.map(it => {
      if (isResolveIdentifierRecord(it)) {
        return `resolve service identifier ${getResolveIdentifierRecordName(
          it
        )}`;
      } else {
        return it.message;
      }
    });
  }

  clone(): this {
    const resolveRecordManager = new ResolveRecordManager();
    resolveRecordManager._recordStack = this._recordStack.slice();
    return resolveRecordManager as this;
  }
}
