/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:17:41
 */

import { Constructor } from "./constructor.type";

export type ServiceIdentifier<T> = Constructor<T> | string | symbol;
