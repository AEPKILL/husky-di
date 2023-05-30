/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 17:28:37
 */

import { InstanceRefCount } from "@/classes/instance-ref-count";
import type { IContainer, ResolveOptions } from "@/interfaces/container.interface";
import type { IInternalContainer } from "@/interfaces/internal-container.interface";
import type { ResolveContext } from "@/types/resolve-context.type";

export function getResolveContextRefs(
  container: IContainer
): InstanceRefCount<ResolveContext> {
  return (container as IInternalContainer).resolveContextRefs;
}

export function getResolveOptionKey(metadata: ResolveOptions<any>) {
  const { ref = false, dynamic = false } = metadata;

  return [ref, dynamic].map((it) => (it ? 1 : 0)).join("-");
}
