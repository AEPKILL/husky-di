/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 09:29:41
 */

import { Container } from "@/classes/container";
import { ServiceIdentifierManager } from "@/classes/service-identifier-manager";
import { configureManager } from "@/shared/instances";

export { ServiceIdentifierManager, Container };

export type {
  IContainer,
  ResolveOptions,
  ResolveReturnType
} from "@/interfaces/container.interface";
export type { IProvider } from "@/interfaces/provider.interface";
export type { ServiceIdentifier } from "@/types/service-identifier.type";
export type { ServiceDecorator } from "@/types/service-decorator.type";
export type { Ref } from "@/types/ref.type";
export type { InjectionMetadata } from "@/types/injection-metadata.type";
export type { ResolveContext } from "@/types/resolve-context.type";

export { LifecycleEnum } from "@/enums/lifecycle.enum";

export { tagged } from "@/decorators/tagged.decorator";
export { inject } from "@/decorators/inject.decorator";
export { injectable } from "@/decorators/injectable.decorator";

export { ClassProvider } from "@/providers/class.provider";
export { ValueProvider } from "@/providers/value.provider";
export { FactoryProvider, Factory } from "@/providers/factory.provider";

export { formatStringsWithIndent } from "@/utils/format.utils";
export {
  resolve,
  createContainerFromRegistration
} from "@/utils/container.utils";
export { isServiceIdentifier } from "@/utils/service-identifier.utils";
export { Registration } from "@/classes/registration";

export const createContainer = Container.createContainer.bind(Container);
export const createServiceIdentifier =
  ServiceIdentifierManager.createServiceIdentifier.bind(
    ServiceIdentifierManager
  );
export const createServiceDecorator =
  ServiceIdentifierManager.createServiceDecorator.bind(
    ServiceIdentifierManager
  );

export const setConfigure =
  configureManager.getConfigure.bind(configureManager);
export const getConfigure =
  configureManager.setConfigure.bind(configureManager);
