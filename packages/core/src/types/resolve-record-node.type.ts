/**
 * @overview
 * @author AEPKILL
 * @created 2025-06-25 23:21:39
 */

import type { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type { IModule } from "@/interfaces/module.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type MessageResolveRecordNode = {
	type: ResolveIdentifierRecordTypeEnum.message;
	message: string;
};

export type ServiceIdentifierResolveRecordNode<T> = {
	type: ResolveIdentifierRecordTypeEnum.serviceIdentifier;
	serviceIdentifier: ServiceIdentifier<T>;
	container: IContainer;
	from: IModule[];
};
