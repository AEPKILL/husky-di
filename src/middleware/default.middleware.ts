/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:06:19
 */

import { UsingResolveRecordManager } from '../classes/usings/using-resolve-record-manager';
import { LifecycleEnum } from '../enums/lifecycle.enum';
import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
} from '../interfaces/container.interface';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';
import { metadataKeyExtractor } from '../shared/key-extractors';
import { using } from '../shared/using';

export const defaultMiddleware: ContainerMiddleware<any> = <T>(
  middlewareArgs: ContainerMiddlewareArgs<T>
): T | T[] => {
  const { container, resolveContext, metadata } = middlewareArgs;
  const { serviceIdentifier, multiple } = metadata;

  if (!container.isRegistered(serviceIdentifier)) {
    throw using(new UsingResolveRecordManager())(resolveRecordManager => {
      return resolveRecordManager.getResolveException(
        `attempted to resolve unregistered dependency service identifier: "${getServiceIdentifierName(
          serviceIdentifier
        )}"`
      );
    });
  }

  let instance: T | T[];

  if (multiple) {
    instance = container
      .getAllProvider(serviceIdentifier)
      .map((provider, index) => {
        // 从 single 中解析值
        const tryResolveInContext =
          index === 0 && provider.lifecycle === LifecycleEnum.resolutionScoped;
        if (tryResolveInContext) {
          if (resolveContext.has(serviceIdentifier)) {
            const cache = resolveContext.get(serviceIdentifier)!;
            const key = metadataKeyExtractor({ ...metadata, multiple: false });
            if (cache.has(key)) {
              return cache.get(key);
            }
          }
        }

        if (provider.resolved) {
          return provider.instance!;
        }

        const itInstance = provider.resolve(container, resolveContext);
        if (provider.lifecycle === LifecycleEnum.singleton) {
          provider.setInstance(itInstance);
          provider.setWasResolved();
        }

        return itInstance;
      });
  } else {
    const provider = container.getProvider(serviceIdentifier)!;
    if (provider.resolved) {
      return provider.instance!;
    }

    instance = provider.resolve(container, resolveContext);
    if (provider.lifecycle === LifecycleEnum.singleton) {
      provider.setInstance(instance);
      provider.setWasResolved();
    }
  }

  return instance;
};
