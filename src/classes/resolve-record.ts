/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-04 07:11:17
 */

import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { ServiceIdentifier } from '../types/service-identifier.type';

export interface ServiceIdentifierRecord {
  serviceIdentifier: ServiceIdentifier<any>;
  ref?: boolean;
}

function getServiceIdentifierRecordName(
  serviceIdentifierRecord: ServiceIdentifierRecord
) {
  const { serviceIdentifier, ref } = serviceIdentifierRecord;

  const serviceIdentifierName = getServiceIdentifierName(serviceIdentifier);

  if (ref) {
    return `${serviceIdentifierName}(Ref)`;
  }

  return serviceIdentifierName;
}

export class ResolveRecord {
  private _messageStack: string[] = [];
  private _serviceIdentifierRecordStack: Array<ServiceIdentifierRecord> = [];

  get messageStack(): string[] {
    return this._messageStack;
  }

  get serviceIdentifierStack() {
    return this._serviceIdentifierRecordStack;
  }

  getResolveException(message?: string): Error {
    if (message) {
      this.pushMessage(message);
    }
    return new Error(this.getMessage());
  }

  getMessage(): string {
    const messagesLength = this.messageStack.length;

    let message = '';

    if (this._serviceIdentifierRecordStack.length > 1) {
      message = `${this.getServiceIdentifierReferenceMessage()}\n`;
    }

    message += this.messageStack.reduce((message, it, index) => {
      const shouldBreak = index < messagesLength - 1;

      message += ' '.repeat(index) + it;
      if (shouldBreak) {
        message += '\n';
      }

      return message;
    }, '');

    return message;
  }

  pushMessage(message: string): void {
    this._messageStack.push(message);
  }

  popMessage() {
    this._messageStack.pop();
  }

  pushServiceIdentifier(serviceIdentifierRecord: ServiceIdentifierRecord) {
    this._serviceIdentifierRecordStack.push(serviceIdentifierRecord);
  }

  popServiceIdentifier() {
    this._serviceIdentifierRecordStack.pop();
  }

  hasCycle() {
    if (this._serviceIdentifierRecordStack.length > 1) {
      const serviceIdentifierRecord = this._serviceIdentifierRecordStack[
        this.serviceIdentifierStack.length - 1
      ];
      if (!serviceIdentifierRecord.ref) {
        for (let i = this.serviceIdentifierStack.length - 2; i >= 0; i--) {
          const it = this.serviceIdentifierStack[i];
          if (it.ref) {
            break;
          }
          const isEqualServiceIdentifier =
            it.serviceIdentifier === serviceIdentifierRecord.serviceIdentifier;
          if (isEqualServiceIdentifier) {
            return true;
          }
        }
      }
    }
    return false;
  }

  getServiceIdentifierReferenceMessage() {
    const hasCycle = this.hasCycle();
    const cycleServiceIdentifierRecord = hasCycle
      ? this._serviceIdentifierRecordStack[
          this._serviceIdentifierRecordStack.length - 1
        ]
      : null;

    let serviceIdentifierNames: string[] = [];

    for (const it of this._serviceIdentifierRecordStack) {
      let serviceIdentifierRecordName = getServiceIdentifierRecordName(it);

      const equalAndNotRef =
        !it.ref &&
        it.serviceIdentifier ===
          cycleServiceIdentifierRecord?.serviceIdentifier;
      if (equalAndNotRef && !it.ref) {
        serviceIdentifierRecordName = `[${serviceIdentifierRecordName}]`;
      }
      serviceIdentifierNames.push(serviceIdentifierRecordName);
    }

    return serviceIdentifierNames.join('->');
  }

  clone(): ResolveRecord {
    const resolveRecord = new ResolveRecord();
    resolveRecord._messageStack = this._messageStack.slice();
    resolveRecord._serviceIdentifierRecordStack = this._serviceIdentifierRecordStack.slice();

    return resolveRecord;
  }
}
