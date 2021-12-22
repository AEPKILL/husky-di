/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:06:19
 *
 */

import { ResolveRecordManager } from '../classes/resolve-record-manager';
import { UsingResolveContext } from '../classes/usings/using-resolve-context';
import { UsingResolveRecordManager } from '../classes/usings/using-resolve-record-manager';
import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
  ContainerMiddlewareNext,
} from '../interfaces/container.interface';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { using } from '../shared/using';
import { Ref } from '../types/ref.type';

export const refMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] | Ref<T | T[]> => {
  const { container, resolveContext, metadata } = middlewareArgs;
  const { serviceIdentifier, ref = false } = metadata;

  if (ref === false) {
    return next(middlewareArgs);
  }

  let resolveRecordManagerSnapshoot: ResolveRecordManager;
  let resolved = false;
  let instance: T | T[];

  using(new UsingResolveRecordManager())(it => {
    resolveRecordManagerSnapshoot = it.clone();
    resolveRecordManagerSnapshoot.pushResolveRecord({
      message: `"${getServiceIdentifierName(
        serviceIdentifier
      )}" is a ref value, wait for use`,
    });
  });

  return {
    get resolved() {
      return resolved;
    },
    get current() {
      if (resolved) {
        return instance!;
      }

      instance = using(
        new UsingResolveContext(container, resolveContext),
        new UsingResolveRecordManager(resolveRecordManagerSnapshoot)
      )(() => {
        return container.resolve(serviceIdentifier, {
          ...metadata,
          ref: false,
        });
      });

      resolved = true;

      return instance;
    },
  };
}) as ContainerMiddlewareNext;
