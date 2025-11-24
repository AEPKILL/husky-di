/**
 * @overview Type definitions for dependency resolution records
 * @author AEPKILL
 * @created 2025-07-29 22:55:24
 *
 * Type relationship overview:
 *
 * 1. ResolveRecordData<T> - Resolution record data (data part)
 *    - RootResolveRecordData: Root resolution record data, represents the start of resolution
 *    - MessageResolveRecordData: Message resolution record data, used to record messages during resolution
 *    - ServiceIdentifierResolveRecordData<T>: Service identifier resolution record data, records specific service resolution
 *
 * 2. ResolveRecordTreeNode<T> - Resolution record tree node (tree structure)
 *    - Contains parent-child relationships, forming a tree structure
 *    - Each node contains a ResolveRecordData<T> as its value
 *    - Used to track the complete path of dependency resolution
 *
 * 3. IResolveRecord - Resolution record interface
 *    - Manages the state of the entire resolution process
 *    - Provides access to current node and root node
 *    - Supports adding nodes, detecting circular references, getting paths, etc.
 *
 * 4. IInternalResolveRecord - Internal resolution record interface
 *    - Extends IResolveRecord, adds functionality to set current node
 *    - Mainly used for internal implementation
 */

import type { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import type {
	IContainer,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IUnique } from "@/interfaces/unique.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type RootResolveRecordData = {
	readonly type: ResolveRecordTypeEnum.root;
	readonly container: IContainer;
};

export type MessageResolveRecordData = {
	readonly type: ResolveRecordTypeEnum.message;
	readonly message: string;
};

export type ServiceIdentifierResolveRecordData<T> = {
	readonly type: ResolveRecordTypeEnum.serviceIdentifier;
	readonly serviceIdentifier: ServiceIdentifier<T>;
	readonly resolveOptions: ResolveOptions<T>;
	readonly container: IContainer;
};

export type ResolveRecordData<T> =
	| RootResolveRecordData
	| MessageResolveRecordData
	| ServiceIdentifierResolveRecordData<T>;

export type ResolveRecordTreeNode<T> = {
	readonly parent?: ResolveRecordTreeNode<T>;
	readonly children: Array<ResolveRecordTreeNode<T>>;
	readonly value: ResolveRecordData<T>;
} & IUnique;

export type CycleNodeInfo = {
	cycleNode: ResolveRecordTreeNode<unknown>;
};

export interface IResolveRecord extends IUnique {
	readonly current: ResolveRecordTreeNode<unknown>;
	readonly root: ResolveRecordTreeNode<unknown>;

	addRecordNode(node: ResolveRecordData<unknown>): void;

	getCycleNodeInfo(): undefined | CycleNodeInfo;

	getPaths(): Array<ResolveRecordTreeNode<unknown>>;

	getCurrentContainer(): IContainer | undefined;
}

export interface IInternalResolveRecord extends IResolveRecord {
	readonly _internalCurrentStack: Array<ResolveRecordTreeNode<unknown>>;
	_internalSetCurrent(node: ResolveRecordTreeNode<unknown>): void;
	_internalStashCurrent(): void;
	_internalRestoreCurrent(): void;
}
