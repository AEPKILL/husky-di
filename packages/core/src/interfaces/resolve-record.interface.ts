/**
 * Type definitions for dependency resolution records.
 *
 * @overview
 * Defines the data structures used to track and debug service resolution
 * processes. Resolution records form a tree structure that tracks the complete
 * path of dependency resolution, enabling circular dependency detection and
 * detailed error reporting.
 *
 * @remarks
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
 *
 * @author AEPKILL
 * @created 2025-07-29 22:55:24
 */

import type { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import type {
	IContainer,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IUnique } from "@/interfaces/unique.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Root resolution record data.
 *
 * @remarks
 * Represents the start of a resolution chain. Every resolution process
 * begins with a root record.
 */
export type RootResolveRecordData = {
	readonly type: ResolveRecordTypeEnum.root;
	readonly container: IContainer;
};

/**
 * Message resolution record data.
 *
 * @remarks
 * Used to record messages or annotations during the resolution process,
 * useful for debugging and error reporting.
 */
export type MessageResolveRecordData = {
	readonly type: ResolveRecordTypeEnum.message;
	readonly message: string;
};

/**
 * Service identifier resolution record data.
 *
 * @typeParam T - The service type
 *
 * @remarks
 * Records a specific service resolution, including the service identifier,
 * resolve options, and the container performing the resolution.
 */
export type ServiceIdentifierResolveRecordData<T> = {
	readonly type: ResolveRecordTypeEnum.serviceIdentifier;
	readonly serviceIdentifier: ServiceIdentifier<T>;
	readonly resolveOptions: ResolveOptions<T>;
	readonly container: IContainer;
};

/**
 * Union type of all resolution record data types.
 *
 * @typeParam T - The service type
 */
export type ResolveRecordData<T> =
	| RootResolveRecordData
	| MessageResolveRecordData
	| ServiceIdentifierResolveRecordData<T>;

/**
 * Tree node structure for resolution records.
 *
 * @typeParam T - The service type
 *
 * @remarks
 * Forms a tree structure where each node represents a step in the resolution
 * process. Parent-child relationships track the dependency chain, enabling
 * circular dependency detection and path visualization.
 */
export type ResolveRecordTreeNode<T> = {
	/** The parent node in the resolution tree */
	readonly parent?: ResolveRecordTreeNode<T>;
	/** Child nodes representing dependent resolutions */
	readonly children: Array<ResolveRecordTreeNode<T>>;
	/** The resolution record data for this node */
	readonly value: ResolveRecordData<T>;
} & IUnique;

/**
 * Information about a detected circular dependency cycle.
 */
export type CycleNodeInfo = {
	/** The node where the cycle was detected */
	cycleNode: ResolveRecordTreeNode<unknown>;
};

/**
 * Interface for managing resolution records.
 *
 * @remarks
 * Tracks the complete resolution process, including the current resolution
 * point, the root of the resolution tree, and provides methods for detecting
 * circular dependencies and retrieving resolution paths.
 */
export interface IResolveRecord extends IUnique {
	/** The current node in the resolution tree */
	readonly current: ResolveRecordTreeNode<unknown>;
	/** The root node of the resolution tree */
	readonly root: ResolveRecordTreeNode<unknown>;

	/**
	 * Adds a new record node to the resolution tree.
	 *
	 * @param node - The record data to add
	 */
	addRecordNode(node: ResolveRecordData<unknown>): void;

	/**
	 * Gets information about a detected circular dependency cycle.
	 *
	 * @returns Cycle information if a cycle was detected, undefined otherwise
	 */
	getCycleNodeInfo(): undefined | CycleNodeInfo;

	/**
	 * Gets the path from root to current node.
	 *
	 * @returns An array of nodes representing the resolution path
	 */
	getPaths(): Array<ResolveRecordTreeNode<unknown>>;

	/**
	 * Gets the container currently performing resolution.
	 *
	 * @returns The current container, or undefined if not available
	 */
	getCurrentContainer(): IContainer | undefined;
}

/**
 * Internal resolution record interface with additional internal methods.
 *
 * @remarks
 * Extends IResolveRecord with internal methods for managing the current node
 * stack. These methods are used internally by the container implementation
 * to manage resolution state and should not be called by external code.
 *
 * @internal
 */
export interface IInternalResolveRecord extends IResolveRecord {
	/** Internal stack for managing current node state */
	readonly _internalCurrentStack: Array<ResolveRecordTreeNode<unknown>>;

	/**
	 * Sets the current node.
	 *
	 * @internal
	 * @param node - The node to set as current
	 */
	_internalSetCurrent(node: ResolveRecordTreeNode<unknown>): void;

	/**
	 * Stashes the current node on the stack.
	 *
	 * @internal
	 */
	_internalStashCurrent(): void;

	/**
	 * Restores the current node from the stack.
	 *
	 * @internal
	 */
	_internalRestoreCurrent(): void;
}
