/**
 * @overview
 * @author AEPKILL
 * @created 2023-09-18 09:58:47
 */

import { Container } from "@/classes/container";
import { resolveRecordManagerRef } from "@/shared/instances";

import type {
  ResolveOptions,
  IContainer,
  ResolveReturnType
} from "@/interfaces/container.interface";
import type { IRegistration } from "@/interfaces/registration.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

function _resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
function _resolve<T, Options extends ResolveOptions<T>>(
  serviceIdentifier: ServiceIdentifier<T>,
  options: Options
): ResolveReturnType<T, Options>;
function _resolve<T, Options extends ResolveOptions<T>>(
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

  return currentContainer.resolve(serviceIdentifier, options!);
}

// Ensure the function signatures are consistent.
export const resolve: IContainer["resolve"] = _resolve;

export function createContainerFromRegistration(
  name: string,
  registration: IRegistration
): IContainer {
  const serviceIdentifiers = registration.getAllRegisteredServiceIdentifiers();

  return Container.createContainer(name, (container) => {
    for (const serviceIdentifier of serviceIdentifiers) {
      const providers = registration.getAllProvider(serviceIdentifier);
      for (const provider of providers) {
        container.register(serviceIdentifier, provider.clone());
      }
    }
  });
}
