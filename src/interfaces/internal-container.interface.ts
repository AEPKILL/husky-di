/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 17:24:49
 */

import type { InstanceRefCount } from "@/classes/instance-ref-count";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { IContainer } from "./container.interface";

export interface IInternalContainer extends IContainer {
  readonly resolveContextRefs: InstanceRefCount<ResolveContext>;
}
