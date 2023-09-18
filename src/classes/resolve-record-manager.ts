/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 11:21:00
 */

import { ResolveException } from "@/exceptions/resolve.exception";
import { formatStringsWithIndent } from "@/utils/format.utils";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";

import type {
  IContainer,
  ResolveOptions
} from "@/interfaces/container.interface";
import type { IDerivation } from "@/interfaces/derivation.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type ResolveMessageRecord = {
  message: string;
};
export type ResolveIdentifierRecord<T> = {
  container: IContainer;
  serviceIdentifier: ServiceIdentifier<T>;
  resolveOptions?: ResolveOptions<T>;
};

export type ResolveRecord<T> =
  | ResolveMessageRecord
  | ResolveIdentifierRecord<T>;

export type GetResolveExceptionOptions = {
  exception?: Error;
  cycleResolveIdentifierRecord?: ResolveIdentifierRecord<any> | null;
};

export class ResolveRecordManager implements IDerivation {
  private _resolveRecordStack: ResolveRecord<any>[] = [];

  get recordCount(): number {
    return this._resolveRecordStack.length;
  }

  restore(resolveRecordStack: ResolveRecord<any>[]): void {
    this._resolveRecordStack = resolveRecordStack;
  }

  getResolveRecordStack(): ResolveRecord<any>[] {
    return this._resolveRecordStack.slice();
  }

  pushResolveRecord(resolveRecord: ResolveRecord<any>): void {
    this._resolveRecordStack.push(resolveRecord);
  }

  popResolveRecord(): void {
    this._resolveRecordStack.pop();
  }

  getResolveException(
    message?: string,
    options: GetResolveExceptionOptions = {}
  ): ResolveException {
    const { cycleResolveIdentifierRecord, exception } = options;

    // if is resolve exception, return it directly
    if (ResolveException.isResolveException(exception)) {
      return exception;
    }

    if (message) {
      this.pushResolveRecord({ message });
    }

    const resolveMessage = this.getResolveMessage(cycleResolveIdentifierRecord);
    const resolveException = new ResolveException(resolveMessage);

    // if has original exception, cut out the call stack of the original exception for easy positioning of the problem
    if (exception) {
      const stacks = (exception.stack || "").split("\n");
      stacks.shift();
      resolveException.stack = resolveMessage + "\n" + stacks.join("\n");
    }

    return resolveException;
  }

  getResolveMessage(
    cycleResolveIdentifierRecord?: ResolveIdentifierRecord<any> | null
  ): string {
    const resolveIdentifierRecordMessage = this.getResolveIdentifierRecords()
      .map((it) => {
        let message = getResolveIdentifierRecordName(it);

        // make a mark for the node of the circular reference
        const isCycleNode =
          cycleResolveIdentifierRecord &&
          isEqualResolveRecord(it, cycleResolveIdentifierRecord);
        if (isCycleNode) {
          message = `(( ${message} ))`;
        }

        return message;
      })
      .join(" -> ");

    return `${resolveIdentifierRecordMessage}\n${formatStringsWithIndent(
      this.getResolveMessages()
    )}`;
  }

  getParentRequestContainer(): IContainer | null {
    if (!this._resolveRecordStack.length) {
      return null;
    }

    // containers[0] is current container
    // containers[1] is parent container
    const containers: IContainer[] = [];

    for (let i = this._resolveRecordStack.length - 1; i >= 0; i--) {
      const it = this._resolveRecordStack[i];
      if (isResolveIdentifierRecord(it)) {
        containers.push(it.container);
      }
      if (containers.length === 2) {
        break;
      }
    }

    return containers[1] || null;
  }

  getCurrentRequestContainer(): IContainer | null {
    for (let i = this._resolveRecordStack.length - 1; i >= 0; i--) {
      const it = this._resolveRecordStack[i];

      if (isResolveIdentifierRecord(it)) {
        return it.container;
      }
    }
    return null;
  }

  getCycleResolveIdentifierRecord(): null | ResolveIdentifierRecord<any> {
    if (this._resolveRecordStack.length < 2) {
      return null;
    }

    // only check latest resolve record
    const latestResolveRecord =
      this._resolveRecordStack[this._resolveRecordStack.length - 1];

    if (!isResolveIdentifierRecord(latestResolveRecord)) {
      return null;
    }

    if (latestResolveRecord.resolveOptions?.ref) {
      return null;
    }

    if (latestResolveRecord.resolveOptions?.dynamic) {
      return null;
    }

    for (let i = this._resolveRecordStack.length - 2; i >= 0; i--) {
      const it = this._resolveRecordStack[i];

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

  getResolveIdentifierRecords(): ResolveIdentifierRecord<any>[] {
    return this._resolveRecordStack.filter((it) =>
      isResolveIdentifierRecord(it)
    ) as ResolveIdentifierRecord<any>[];
  }

  getResolveMessages(): string[] {
    return this._resolveRecordStack.map((it) => {
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
    resolveRecordManager._resolveRecordStack = this._resolveRecordStack.slice();
    return resolveRecordManager as this;
  }
}

function isResolveIdentifierRecord<T>(
  resolveRecord: ResolveRecord<T>
): resolveRecord is ResolveIdentifierRecord<T> {
  const tempResolveRecord = resolveRecord as ResolveIdentifierRecord<T>;

  return (
    tempResolveRecord.container !== void 0 &&
    tempResolveRecord.serviceIdentifier !== void 0
  );
}

function getResolveIdentifierRecordName<T>(
  resolveIdentifierRecord: ResolveIdentifierRecord<T>
): string {
  const names = [];
  const serviceIdentifierName = getServiceIdentifierName(
    resolveIdentifierRecord.serviceIdentifier
  );

  names.push("#" + resolveIdentifierRecord.container.name);

  const { ref, dynamic, optional, multiple, defaultValue } =
    resolveIdentifierRecord.resolveOptions || {};

  if (ref) {
    names.push("Ref");
  }

  if (dynamic) {
    names.push("Dynamic");
  }

  if (optional) {
    names.push("Optional");
  }

  if (multiple) {
    names.push("Multiple");
  }

  if (defaultValue) {
    names.push("DefaultValue");
  }

  return `${serviceIdentifierName}[${names.join(",")}]`;
}

// check two resolve record is equal, for check cycle reference
function isEqualResolveRecord(
  aResolveRecord: ResolveRecord<any>,
  bResolveRecord: ResolveRecord<any>
): boolean {
  if (
    isResolveIdentifierRecord(aResolveRecord) &&
    isResolveIdentifierRecord(bResolveRecord)
  ) {
    const containerIsEqual =
      aResolveRecord.container === bResolveRecord.container;
    const serviceIdentifierIsEqual =
      aResolveRecord.serviceIdentifier === bResolveRecord.serviceIdentifier;

    // this method is used to determine circular references, when ref or dynamic is added, there will be no circular references
    // so when one of these two flags is true, it is considered that the two resolve records are not equal
    // don't case about optional flag, because optional flag not affect resolve process when service identifier is registered
    const isNotRef =
      !aResolveRecord.resolveOptions?.ref &&
      !bResolveRecord.resolveOptions?.ref;
    const isNotDynamic =
      !aResolveRecord.resolveOptions?.dynamic &&
      !bResolveRecord.resolveOptions?.dynamic;

    return (
      containerIsEqual && serviceIdentifierIsEqual && isNotRef && isNotDynamic
    );
  }

  return false;
}
