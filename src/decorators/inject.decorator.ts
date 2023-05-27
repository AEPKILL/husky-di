/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 21:08:27
 */

import { InjectionMetadata } from "@/types/injection-metadata.type";
import { ServiceIdentifier } from "@/types/service-identifier.type";
import { tagged } from "./tagged.decorator";

export interface InjectOptions<T>
  extends Omit<InjectionMetadata<T>, "serviceIdentifier"> {}

export const inject = <T>(
  serviceIdentifier: ServiceIdentifier<T>,
  options?: InjectOptions<T>
): ParameterDecorator => {
  return tagged({ ...options, serviceIdentifier });
};
