/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 16:05:45
 */

import {
  IResolveRecord,
  IResolveIdentifierRecord,
} from '../../interfaces/resolve-record.interface';
import { getServiceIdentifierName } from './service-identifier.helper';

export function isResolveIdentifierRecord<T>(
  resolveRecord: IResolveRecord<T>
): resolveRecord is IResolveIdentifierRecord<T> {
  const tempResolveRecord = resolveRecord as IResolveIdentifierRecord<T>;

  return (
    tempResolveRecord.container !== void 0 &&
    tempResolveRecord.serviceIdentifier !== void 0
  );
}

/**
 *
 * @param resolveIdentifierRecord
 * @returns
 * @example
 *
 * IUser[#A, Ref, Multiple]
 */
export function getResolveIdentifierRecordName<T>(
  resolveIdentifierRecord: IResolveIdentifierRecord<T>
): string {
  const names = [];
  const serviceIdentifierName = getServiceIdentifierName(
    resolveIdentifierRecord.serviceIdentifier
  );

  names.push('#' + resolveIdentifierRecord.container.name);

  if (resolveIdentifierRecord.resolveOptions?.ref) {
    names.push('Ref');
  }

  if (resolveIdentifierRecord.resolveOptions?.optional) {
    names.push('Optional');
  }

  if (resolveIdentifierRecord.resolveOptions?.multiple) {
    names.push('Multiple');
  }

  if (resolveIdentifierRecord.resolveOptions?.defaultValue) {
    names.push('DefaultValue');
  }

  return `${serviceIdentifierName}[${names.join(',')}]`;
}

export function isEqualResolveRecord(
  aResolveRecord: IResolveRecord<any>,
  bResolveRecord: IResolveRecord<any>
): boolean {
  if (
    isResolveIdentifierRecord(aResolveRecord) &&
    isResolveIdentifierRecord(bResolveRecord)
  ) {
    const containerIsEqual =
      aResolveRecord.container === bResolveRecord.container;
    const serviceIdentifierIsEqual =
      aResolveRecord.serviceIdentifier === bResolveRecord.serviceIdentifier;
    const isNotRef =
      !aResolveRecord.resolveOptions?.ref &&
      !bResolveRecord.resolveOptions?.ref;
    const isNotDynamic =
      !aResolveRecord.resolveOptions?.dynamic &&
      !bResolveRecord.resolveOptions?.dynamic;

    return [
      containerIsEqual,
      serviceIdentifierIsEqual,
      isNotRef,
      isNotDynamic,
    ].every(it => it === true);
  }

  return false;
}
  