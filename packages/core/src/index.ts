/**
 * Core dependency injection library exports.
 *
 * @overview
 * This is the main entry point for the husky-di core package. It exports
 * all public APIs including containers, types, interfaces, utilities, and
 * factory functions needed to use the dependency injection system.
 *
 * @author AEPKILL
 * @created 2025-07-30 22:40:39
 */
import { ContainerImpl } from "@/impls/container.impl";

export { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
export { LifecycleEnum } from "@/enums/lifecycle.enum";
export { RegistrationTypeEnum } from "@/enums/registration-type.enum";
export { ResolveContainerScopeEnum } from "@/enums/resolve-container-scope.enum";
export { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";

export {
	CodedException,
	formatCodedErrorMessage,
} from "@/exceptions/coded.exception";
export { CoreException } from "@/exceptions/core.exception";
export { ResolveException } from "@/exceptions/resolve.exception";

export { createContainer } from "@/factories/container.factory";
export { createRegistrationPlan } from "@/factories/registration-plan.factory";

export type {
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddleware,
	ResolveMiddlewareExecutor,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
export { IContainer } from "@/interfaces/container.interface";
export type { IDisplayName } from "@/interfaces/display-name.interface";
export type {
	Cleanup,
	IDisposable,
} from "@/interfaces/disposable.interface";
export { IDisposableRegistry } from "@/interfaces/disposable-registry.interface";
export type { IMiddlewareManager } from "@/interfaces/middleware-chain.interface";
export type {
	CreateAliasRegistrationOptions,
	CreateClassRegistrationOptions,
	CreateFactoryRegistrationOptions,
	CreateRegistrationBaseOptions,
	CreateRegistrationOptions,
	CreateValueRegistrationOptions,
	IRegistration,
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
	RegistrationPlan,
	RegistrationPlanConfigure,
	RegistrationPlanEntry,
	RegistrationPlanRegister,
} from "@/types/registration-plan.type";
export type { ResolveHelperOptions } from "@/types/resolve-helper-options.type";
export type {
	ServiceIdentifier,
	ServiceIdentifierInstance,
} from "@/types/service-identifier.type";
export { resolve } from "@/utils/container.util";
export {
	isEqualServiceIdentifierResolveRecord,
	isResolveMessageRecord,
	isResolveRootRecord,
	isResolveServiceIdentifierRecord,
} from "@/utils/resolve-record.util";
export {
	createServiceIdentifier,
	getServiceIdentifierName,
} from "@/utils/service-identifier.util";
export {
	createContainerId,
	createRegistrationId,
	createResolveRecordId,
	type IdGenerator,
	incrementalIdFactory,
} from "@/utils/uuid.util";

export const rootContainer = ContainerImpl.rootContainer;
