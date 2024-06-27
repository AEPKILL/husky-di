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

export function isServiceIdentifier<T>(
  serviceIdentifier: ServiceIdentifier<T> | any
): serviceIdentifier is ServiceIdentifier<T> {
  return (
    typeof serviceIdentifier === "function" ||
    typeof serviceIdentifier === "symbol" ||
    typeof serviceIdentifier === "string"
  );
}
