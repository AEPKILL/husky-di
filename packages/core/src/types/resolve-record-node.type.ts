/**
 * @overview
 * @author AEPKILL
 * @created 2025-06-25 23:21:39
 */

import type { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import type {
	IContainer,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IModule } from "@/interfaces/module.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type MessageResolveRecordNode = {
	readonly type: ResolveIdentifierRecordTypeEnum.message;
	readonly message: string;
};

export type ServiceIdentifierResolveRecordNode<T> = {
	readonly type: ResolveIdentifierRecordTypeEnum.serviceIdentifier;
	readonly serviceIdentifier: ServiceIdentifier<T>;
	readonly options: ResolveOptions<T>;
	readonly container: IContainer;
	readonly from: IModule[];
};

export type ResolveRecordNode<T> =
	| MessageResolveRecordNode
	| ServiceIdentifierResolveRecordNode<T>;
