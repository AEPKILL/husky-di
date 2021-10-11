/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:06:19
 */

import { LifecycleEnum } from '../enums/lifecycle.enum';
import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
  ContainerMiddlewareNext,
} from '../interfaces/container.interface';

export const resolutionScopedMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] => {
  const { container, metadata, resolveContext } = middlewareArgs;
  const { serviceIdentifier } = metadata;

  // 不用判断生命周期是否是 resolutionScoped
  // resolveContext 中只要有一定是 resolutionScoped
  if (resolveContext.has(serviceIdentifier)) {
    return resolveContext.get(serviceIdentifier);
  }

  const result = next(middlewareArgs);

  const shouldCacheResultToContext =
    container.isRegistered(serviceIdentifier) &&
    container.getProvider(serviceIdentifier)?.lifecycle ===
      LifecycleEnum.resolutionScoped;
  if (shouldCacheResultToContext) {
    resolveContext.set(serviceIdentifier, result);
  }

  return result;
}) as ContainerMiddlewareNext;
