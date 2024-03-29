/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-08 14:35:38
 */

import type { ServiceIdentifier } from "@/types/service-identifier.type";

declare global {
  interface Function {
    readonly name: string;
  }
}

export function getServiceIdentifierName(
  serviceIdentifier: ServiceIdentifier<any>
): string {
  if (typeof serviceIdentifier === "function") {
    return serviceIdentifier.name;
  }

  if (typeof serviceIdentifier === "symbol") {
    return serviceIdentifier.toString();
  }

  return serviceIdentifier;
}
