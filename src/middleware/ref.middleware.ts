/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:06:19
 *
 */

import { ResolveContextManager } from '../classes/resolve-context-manager';
import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
  ContainerMiddlewareNext,
} from '../interfaces/container.interface';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { Ref } from '../types/ref.type';
import { ResolveContext } from '../types/resolve-context.type';

export const refMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] | Ref<T | T[]> => {
  let { container, resolveContext, metadata } = middlewareArgs;
  let { serviceIdentifier, ref = false } = metadata;

  if (ref === false) {
    return next(middlewareArgs);
  }

  let resolveContextManager: ResolveContextManager = (container as any)
    ._resolveContextManager;
  let resolveRecord = resolveContext.resolveRecord.clone();
  resolveRecord.pushMessage(
    `"${getServiceIdentifierName(
      serviceIdentifier
    )}" is a ref value, wait for use`
  );

  let resolved = false;
  let instance: T | T[];

  return {
    get current() {
      if (resolved) {
        return instance;
      }

      try {
        // restore resolve context
        const currentResolveContext = resolveContextManager.getResolveContext(
          resolveContext
        );

        // restore resolve logger
        (currentResolveContext as Writable<
          ResolveContext
        >).resolveRecord = resolveRecord;

        instance = container.resolve(serviceIdentifier, {
          ...metadata,
          ref: false,
        });

        resolved = true;

        return instance;
      } finally {
        resolveContextManager.popResolveContext();

        // 解析完成后释放对所有资源
        // 这个 getter 闭包内一直保存着引用关系可能导致内存泄漏
        if (resolved) {
          const NULL = null as any;
          resolveContextManager = NULL;
          resolveContext = NULL;
          resolveRecord = NULL;
          container = NULL;
          metadata = NULL;
          serviceIdentifier = NULL;
        }
      }
    },
  };
}) as ContainerMiddlewareNext;
