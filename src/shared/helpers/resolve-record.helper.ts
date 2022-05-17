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

  const { ref, optional, multiple, defaultValue } =
    resolveIdentifierRecord.resolveOptions || {};

  if (ref) {
    names.push('Ref');
  }

  if (optional) {
    names.push('Optional');
  }

  if (multiple) {
    names.push('Multiple');
  }

  if (defaultValue) {
    names.push('DefaultValue');
  }

  return `${serviceIdentifierName}[${names.join(',')}]`;
}

export function isEqualResolveRecord(
  aResolveRecord: IResolveRecord<any>,
  bResolveRecord: IResolveRecord<any>
): boolean {
  const bothIsResolveIdentifierRecord =
    isResolveIdentifierRecord(aResolveRecord) &&
    isResolveIdentifierRecord(bResolveRecord);

  // 只有两个 `ResolveIdentifierRecord` 比较才有意义
  if (bothIsResolveIdentifierRecord) {
    const containerIsEqual =
      aResolveRecord.container === bResolveRecord.container;
    const serviceIdentifierIsEqual =
      aResolveRecord.serviceIdentifier === bResolveRecord.serviceIdentifier;

    // 这个方法是拿来判断循环引用的，当加了 ref 或 dynamic 标识时是不会产生循环引用的
    // 所以当这两个标识有一个为 true 时就认为两个请求记录不相等
    const isNotRef =
      !aResolveRecord.resolveOptions?.ref &&
      !bResolveRecord.resolveOptions?.ref;
    const isNotDynamic =
      !aResolveRecord.resolveOptions?.dynamic &&
      !bResolveRecord.resolveOptions?.dynamic;

    // TODO 暂时不考虑 optional 的情况
    return (
      containerIsEqual && serviceIdentifierIsEqual && isNotRef && isNotDynamic
    );
  }

  return false;
}
