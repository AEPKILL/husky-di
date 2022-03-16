/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 19:36:21
 */

import { ResolveRecordManager } from '../classes/resolve-record-manager';
import { UsingResolveRecordManager } from '../classes/usings/using-resolve-record-manager';
import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
  ContainerMiddlewareNext,
} from '../interfaces/container.interface';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { using } from '../shared/using';
import { Ref } from '../types/ref.type';

export const dynamicMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] | Ref<T | T[]> => {
  const { metadata, container } = middlewareArgs;
  const { serviceIdentifier, dynamic = false } = metadata;

  if (dynamic === false) {
    return next(middlewareArgs);
  }

  // 动态请求不保留 ResolveContext，但是保留 ResolveRecord
  let resolveRecordManagerSnapshoot: ResolveRecordManager;
  let wasResolved = false;

  using(new UsingResolveRecordManager())(it => {
    resolveRecordManagerSnapshoot = it.clone();
    resolveRecordManagerSnapshoot.pushResolveRecord({
      message: `"${getServiceIdentifierName(
        serviceIdentifier
      )}" is a dynamic value, wait for use`,
    });
  });

  return {
    get resolved() {
      return wasResolved;
    },
    get current() {
      const instance = using(
        new UsingResolveRecordManager(resolveRecordManagerSnapshoot)
      )(() => container.resolve(serviceIdentifier, metadata));
      wasResolved = true;
      return instance;
    },
  };
}) as ContainerMiddlewareNext;
