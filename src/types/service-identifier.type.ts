/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:17:41
 */

import type { Constructor } from "./constructor.type";

export type ServiceIdentifier<T> = Constructor<T> | string | symbol;

export type ServiceIdentifierInstance<R> = R extends ServiceIdentifier<infer T>
  ? T
  : never;
