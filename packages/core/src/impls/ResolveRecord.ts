/**
 * Resolution record implementation.
 *
 * @overview
 * Implements the IInternalResolveRecord interface to track service resolution
 * processes. Maintains a tree structure of resolution steps, enabling circular
 * dependency detection and detailed error reporting with resolution paths.
 *
 * @author AEPKILL
 * @created 2025-07-29 23:36:01
 */

import { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	CycleNodeInfo,
	IInternalResolveRecord,
	ResolveRecordData,
	ResolveRecordTreeNode,
} from "@/interfaces/resolve-record.interface";
import {
	isEqualServiceIdentifierResolveRecord,
	isResolveRootRecord,
	isResolveServiceIdentifierRecord,
} from "@/utils/resolve-record.utils";
import {
	createResolveRecordId,
	incrementalIdFactory,
} from "@/utils/uuid.utils";

/**
 * Resolution record implementation class.
 *
 * @remarks
 * Manages a tree structure of resolution steps, where each node represents
 * a step in the dependency resolution process. The tree structure enables
 * tracking of the complete resolution path and detection of circular dependencies.
 */
export class ResolveRecord implements IInternalResolveRecord {
	/** Gets the current node in the resolution tree. */
	get current() {
		return this._current;
	}

	/** Gets the root node of the resolution tree. */
	get root() {
		return this._root;
	}

	/** Gets the unique identifier for this resolution record. */
	get id() {
		return this._id;
	}

	/** Gets the internal current node stack. */
	get _internalCurrentStack() {
		return this._currentStack;
	}

	private _root: ResolveRecordTreeNode<unknown>;
	private _current: ResolveRecordTreeNode<unknown>;
	private _currentStack: Array<ResolveRecordTreeNode<unknown>> = [];
	private _id: string;
	private _generateTreeNodeId = incrementalIdFactory("RESOLVE_RECORD_NODE");

	/**
	 * Creates a new ResolveRecord.
	 *
	 * @param container - The container that initiated the resolution
	 */
	constructor(container: IContainer) {
		this._id = createResolveRecordId();
		this._root = {
			id: this._generateTreeNodeId(),
			value: {
				type: ResolveRecordTypeEnum.root,
				container,
			},
			children: [],
		};
		this._current = this._root;
	}

	/**
	 * Adds a new record node to the resolution tree.
	 *
	 * @param node - The record data to add
	 */
	addRecordNode(node: ResolveRecordData<unknown>): void {
		const current = {
			id: this._generateTreeNodeId(),
			value: node,
			children: [],
			parent: this._current,
		};
		this._current.children.push(current);
		this._current = current;
	}

	/**
	 * Detects circular dependencies in the resolution path.
	 *
	 * @returns Cycle information if a cycle was detected, undefined otherwise
	 */
	getCycleNodeInfo(): undefined | CycleNodeInfo {
		const lastRecordNode = this._current;
		if (!isResolveServiceIdentifierRecord(lastRecordNode.value))
			return undefined;

		let tempRecordNode = lastRecordNode;
		while (tempRecordNode.parent) {
			tempRecordNode = tempRecordNode.parent;

			if (!isResolveServiceIdentifierRecord(tempRecordNode.value)) continue;

			const { dynamic, ref } = tempRecordNode.value.resolveOptions;
			// Ref and dynamic options break circular dependency cycles
			if (dynamic || ref) {
				break;
			}

			const isEqual = isEqualServiceIdentifierResolveRecord(
				tempRecordNode.value,
				lastRecordNode.value,
			);

			if (isEqual) {
				return {
					cycleNode: tempRecordNode,
				};
			}
		}
	}

	/**
	 * Gets the container currently performing resolution.
	 *
	 * @returns The current container, or undefined if not available
	 */
	getCurrentContainer(): IContainer | undefined {
		let current: ResolveRecordTreeNode<unknown> | undefined = this._current;
		while (current) {
			if (isResolveServiceIdentifierRecord(current.value)) {
				return current.value.container;
			}

			if (isResolveRootRecord(current.value)) {
				return current.value.container;
			}

			current = current.parent;
		}
	}

	/**
	 * Gets the path from root to current node.
	 *
	 * @returns An array of nodes representing the resolution path
	 */
	getPaths(): Array<ResolveRecordTreeNode<unknown>> {
		const paths: Array<ResolveRecordTreeNode<unknown>> = [];

		let current = this._current;
		while (current.parent) {
			paths.push(current);
			current = current.parent;
		}

		return paths;
	}

	/**
	 * Sets the current node (internal method).
	 *
	 * @internal
	 * @param node - The node to set as current
	 */
	_internalSetCurrent(node: ResolveRecordTreeNode<unknown>) {
		this._current = node;
	}

	/**
	 * Stashes the current node on the stack (internal method).
	 *
	 * @internal
	 */
	_internalStashCurrent() {
		this._currentStack.push(this._current);
	}

	/**
	 * Restores the current node from the stack (internal method).
	 *
	 * @internal
	 * @throws {Error} If there is no node to restore
	 */
	_internalRestoreCurrent() {
		const current = this._currentStack.pop();
		if (!current) {
			throw new Error("No current to restore");
		}
		this._current = current;
	}
}
