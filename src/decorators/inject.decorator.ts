/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:08:27
 */

import { tagged } from "./tagged.decorator";

import type { InjectionMetadata } from "@/types/injection-metadata.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type InjectOptions<T> = Omit<InjectionMetadata<T>, "serviceIdentifier">;

export const inject = <T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: InjectOptions<T>
): ParameterDecorator => {
  return tagged({ ...options, serviceIdentifier });
};
