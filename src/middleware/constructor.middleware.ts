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
import { ClassProvider } from '../providers/class.provider';
import { Constructor } from '../types/constructor.type';

export const constructorMiddleware: ContainerMiddlewareNext = (<T>(
  next: ContainerMiddleware<T | T[]>
) => (middlewareArgs: ContainerMiddlewareArgs<T>): T | T[] => {
  const { container, resolveContext, metadata } = middlewareArgs;
  const { serviceIdentifier, multiple } = metadata;

  const classNotRegistered =
    !container.isRegistered(serviceIdentifier) &&
    typeof serviceIdentifier === 'function';

  if (classNotRegistered) {
    const instance = new ClassProvider({
      useClass: serviceIdentifier as Constructor<T>,
    }).resolve(container, resolveContext);

    if (multiple) {
      return [instance];
    } else {
      return instance;
    }
  }

  return next(middlewareArgs);
}) as ContainerMiddlewareNext;
