/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:06:19
 */

import {
  ContainerMiddleware,
  ContainerMiddlewareArgs,
  ContainerMiddlewareNext,
} from '../interfaces/container.interface';

export const optionalMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] => {
  const { metadata, container } = middlewareArgs;
  const { serviceIdentifier, optional, defaultValue = null } = metadata;

  const notOptional = !optional || container.isRegistered(serviceIdentifier);
  if (notOptional) {
    return next(middlewareArgs);
  }

  return defaultValue as T;
}) as ContainerMiddlewareNext;
