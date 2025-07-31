/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 22:55:24
 */

import type { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import type {
	IContainer,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IUnique } from "@/interfaces/unique.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type RootResolveRecordNode = {
	readonly type: ResolveIdentifierRecordTypeEnum.root;
	readonly container: IContainer;
};

export type MessageResolveRecordNode = {
	readonly type: ResolveIdentifierRecordTypeEnum.message;
	readonly message: string;
};

export type ServiceIdentifierResolveRecordNode<T> = {
	readonly type: ResolveIdentifierRecordTypeEnum.serviceIdentifier;
	readonly serviceIdentifier: ServiceIdentifier<T>;
	readonly resolveOptions: ResolveOptions<T>;
	readonly container: IContainer;
};

export type ResolveRecordNode<T> =
	| RootResolveRecordNode
	| MessageResolveRecordNode
	| ServiceIdentifierResolveRecordNode<T>;

export type ResolveRecordTreeNode<T> = {
	readonly parent?: ResolveRecordTreeNode<T>;
	readonly children: Array<ResolveRecordTreeNode<T>>;
	readonly value: ResolveRecordNode<T>;
} & IUnique;

export interface IResolveRecord extends IUnique {
	readonly current: ResolveRecordTreeNode<unknown>;
	readonly root: ResolveRecordTreeNode<unknown>;

	addRecordNode(node: ResolveRecordNode<unknown>): void;

	getCycleNodes(): ResolveRecordTreeNode<unknown>[];
}

export interface IInternalResolveRecord extends IResolveRecord {
	setCurrent(node: ResolveRecordTreeNode<unknown>): void;
}
