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
import { metadataKeyExtractor } from '../shared/key-extractors';

export const resolutionScopedMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] => {
  const { container, metadata, resolveContext } = middlewareArgs;
  const { serviceIdentifier } = metadata;

  // 不用判断生命周期是否是 resolutionScoped
  // resolveContext 中只要有一定是 resolutionScoped
  if (resolveContext.has(serviceIdentifier)) {
    const cache = resolveContext.get(serviceIdentifier)!;
    const key = metadataKeyExtractor(metadata);
    if (cache.has(key)) {
      return cache.get(key);
    }

    // 尝试从 multiple 中解析值
    if (!metadata.multiple) {
      const key = metadataKeyExtractor({ ...metadata, multiple: true });
      if (cache.has(key)) {
        return cache.get(key)![0];
      }
    }
  }

  const result = next(middlewareArgs);

  const shouldCacheResultToContext =
    container.isRegistered(serviceIdentifier) &&
    container.getProvider(serviceIdentifier)?.lifecycle ===
      LifecycleEnum.resolutionScoped;
  if (shouldCacheResultToContext) {
    const cache = resolveContext.get(serviceIdentifier) || new Map();
    cache.set(metadataKeyExtractor(metadata), result);
    resolveContext.set(serviceIdentifier, cache);
  }

  return result;
}) as ContainerMiddlewareNext;
