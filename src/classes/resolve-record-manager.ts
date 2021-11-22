/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 11:21:00
 */

import {
  IResolveIdentifierRecord,
  IResolveRecord,
} from '../interfaces/resolve-record.interface';
import { generateIndentMessages } from '../shared/helpers/string.helper';
import {
  getResolveIdentifierRecordName,
  isEqualResolveRecord,
  isResolveIdentifierRecord,
} from '../shared/helpers/resolve-record.helper';

export class ResolveRecordManager {
  private _recordStack: IResolveRecord<any>[] = [];

  pushResolveRecord(resolveRecord: IResolveRecord<any>) {
    this._recordStack.push(resolveRecord);
  }

  popResolveRecord() {
    this._recordStack.pop();
  }

  getResolveException(message?: string) {
    if (message) {
      this.pushResolveRecord({ message });
    }
    return new Error(this.getResolveMessage());
  }

  getResolveMessage(): string {
    return '';
  }

  getCycleResolveIdentifierRecord(): null | IResolveIdentifierRecord<any> {
    if (this._recordStack.length < 2) {
      return null;
    }

    const latestResolveRecord = this._recordStack[this._recordStack.length - 1];

    if (!isResolveIdentifierRecord(latestResolveRecord)) {
      return null;
    }

    if (latestResolveRecord.resolveOptions?.ref) {
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
        return `resolve ${getResolveIdentifierRecordName(it)}`;
      } else {
        return it.message;
      }
    });
  }
}
