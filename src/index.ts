/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 09:29:41
 */

import { ServiceIdentifierManager } from "@/classes/service-identifier-manager";

import { Container } from "@/classes/container";
import { IContainer } from "@/interfaces/container.interface";
export { IProvider } from "@/interfaces/provider.interface";
import { ServiceIdentifier } from "@/types/service-identifier.type";
export { Ref } from "@/types/ref.type";

export { LifecycleEnum } from "@/enums/lifecycle.enum";

export { IContainer, ServiceIdentifier, ServiceIdentifierManager };

export { tagged } from "@/decorators/tagged.decorator";
export { inject } from "@/decorators/inject.decorator";
export { injectable } from "@/decorators/injectable.decorator";

export { ClassProvider } from "@/providers/class.provider";
export { ValueProvider } from "@/providers/value.provider";
export { FactoryProvider } from "@/providers/factory.provider";

export { formatStringsWithIndent } from "@/utils/format.utils";

export const createContainer = Container.createContainer.bind(Container);
export const createServiceIdentifier =
  ServiceIdentifierManager.createServiceIdentifier.bind(
    ServiceIdentifierManager
  );
