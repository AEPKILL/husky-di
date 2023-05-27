/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 10:47:34
 */

import { ServiceIdentifier } from "./service-identifier.type";

export type InjectionMetadata<T> = {
  serviceIdentifier: ServiceIdentifier<T>;

  dynamic?: boolean;
  multiple?: boolean;
  ref?: boolean;
  optional?: boolean;
  defaultValue?: T | T[];
};
