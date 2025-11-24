/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 22:40:39
 */

import type { IContainer } from "@/interfaces/container.interface";
import { Container } from "./impls/Container";

export { LifecycleEnum } from "@/enums/lifecycle.enum";
export { RegistrationTypeEnum } from "@/enums/registration-type.enum";
export { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
export { ResolveException } from "@/exceptions/resolve.exception";
export { createContainer } from "@/factories/container.factory";
export type {
	IContainer,
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddleware,
	ResolveMiddlewareExecutor,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
export type { IDisplayName } from "@/interfaces/display-name.interface";
export type { IMiddlewareManager } from "@/interfaces/middleware-chain.interface";
export type {
	CreateAliasRegistrationOptions,
	CreateClassRegistrationOptions,
	CreateFactoryRegistrationOptions,
	CreateRegistrationBaseOptions,
	CreateRegistrationOptions,
	CreateValueRegistrationOptions,
} from "@/interfaces/registration.interface";
export type {
	MessageResolveRecordData as MessageResolveRecordNode,
	ResolveRecordData,
	ResolveRecordTreeNode,
	RootResolveRecordData as RootResolveRecordNode,
	ServiceIdentifierResolveRecordData as ServiceIdentifierResolveRecordNode,
} from "@/interfaces/resolve-record.interface";
export type { IUnique } from "@/interfaces/unique.interface";
export { globalMiddleware } from "@/shared/instances";
export type { AbstractConstructor } from "@/types/abstract-constructor.type";
export type { Constructor } from "@/types/constructor.type";
export type { Ref } from "@/types/ref.type";
export type {
	ServiceIdentifier,
	ServiceIdentifierInstance,
} from "@/types/service-identifier.type";
export { resolve } from "@/utils/container.utils";
export {
	isEqualServiceIdentifierResolveRecord,
	isResolveMessageRecord,
	isResolveRootRecord,
	isResolveServiceIdentifierRecord,
} from "@/utils/resolve-record.utils";
export {
	createServiceIdentifier,
	getServiceIdentifierName,
} from "@/utils/service-identifier.utils";
export {
	createContainerId,
	createRegistrationId,
	createResolveRecordId,
	type IdGenerator,
	incrementalIdFactory,
} from "@/utils/uuid.utils";
export const rootContainer: IContainer = Container.rootContainer;
