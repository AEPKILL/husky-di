/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 10:47:34
 */

import { ResolveOptions } from "@/interfaces/container.interface";
import type { ServiceIdentifier } from "./service-identifier.type";

export interface InjectionMetadata<T> extends ResolveOptions<T> {
  serviceIdentifier: ServiceIdentifier<T>;
}
