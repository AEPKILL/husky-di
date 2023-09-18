/**
 * @overview
 * @author AEPKILL
 * @created 2023-09-18 09:58:47
 */

import {
  IContainer,
  ResolveOptions,
  ResolveReturnType
} from "@/interfaces/container.interface";
import { resolveRecordManagerRef } from "@/shared/instances";
import { ServiceIdentifier } from "@/types/service-identifier.type";

export const resolve: IContainer["resolve"] = function resolve<
  T,
  Options extends ResolveOptions<T>
>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: Options
): ResolveReturnType<T, Options> {
  if (!resolveRecordManagerRef.resolved) {
    throw new Error(
      `the "resolve" method can only be called within the resolve context.`
    );
  }

  const resolveRecordManager = resolveRecordManagerRef.instance!;
  const currentContainer = resolveRecordManager.getCurrentRequestContainer();

  if (currentContainer == null) {
    throw new Error(
      `could not find an available container in current resolve context.`
    );
  }

  return currentContainer.resolve(serviceIdentifier, options);
};
