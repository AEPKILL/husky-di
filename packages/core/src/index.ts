/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 22:40:39
 */

import { Container } from "./impls/Container";

export * from "@/factories/container.factory";
export type {
	IContainer,
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddleware,
	ResolveMiddlewareExecutor,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
export type {
	CreateAliasRegistrationOptions,
	CreateClassRegistrationOptions,
	CreateFactoryRegistrationOptions,
	CreateRegistrationBaseOptions,
	CreateRegistrationOptions,
	CreateValueRegistrationOptions,
} from "@/interfaces/registration.interface";

export { createServiceIdentifier } from "@/utils/service-identifier.utils";

export const rootContainer = Container.rootContainer;
