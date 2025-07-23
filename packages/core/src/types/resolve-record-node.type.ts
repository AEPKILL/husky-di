/**
 * @overview
 * @author AEPKILL
 * @created 2025-06-25 23:21:39
 */

import type { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import type { IModule, ResolveOptions } from "@/interfaces/module.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type MessageResolveRecordNode = {
	readonly type: ResolveIdentifierRecordTypeEnum.message;
	readonly message: string;
};

export type ServiceIdentifierResolveRecordNode<T> = {
	readonly type: ResolveIdentifierRecordTypeEnum.serviceIdentifier;
	readonly serviceIdentifier: ServiceIdentifier<T>;
	readonly options: ResolveOptions<T>;
	readonly paths: IModule[];
};

export type ResolveRecordNode<T> =
	| MessageResolveRecordNode
	| ServiceIdentifierResolveRecordNode<T>;
