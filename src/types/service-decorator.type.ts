/**
 * @overview
 * @author AEPKILL
 * @created 2023-06-07 10:07:17
 */

import type { ResolveOptions } from "@/interfaces/container.interface";
import type { ServiceIdentifier } from "./service-identifier.type";

export interface ServiceDecorator<T> {
  (options?: ResolveOptions<T>): ParameterDecorator;
  serviceIdentifier: ServiceIdentifier<T>;
}
