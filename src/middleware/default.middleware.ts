/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:06:19
 */

import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
} from '../interfaces/container.interface';
import { getServiceIdentifierName } from '../shared/helpers/service-identifier.helper';

export const defaultMiddleware: ContainerMiddleware<any> = <T>(
  middlewareArgs: ContainerMiddlewareArgs<T>
): T | T[] => {
  const { container, resolveContext, metadata } = middlewareArgs;
  const { serviceIdentifier, multiple } = metadata;

  if (!container.isRegistered(serviceIdentifier)) {
    throw resolveContext.resolveLogger.getResolveException(
      `attempted to resolve unregistered dependency service identifier: "${getServiceIdentifierName(
        serviceIdentifier
      )}"`
    );
  }

  let instance: T | T[];

  if (multiple) {
    instance = container.getAllProvider(serviceIdentifier).map(provider => {
      return provider.resolve(container, resolveContext);
    });
  } else {
    instance = container
      .getProvider(serviceIdentifier)!
      .resolve(container, resolveContext);
  }

  return instance;
};
