/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 23:36:01
 */

import { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	CycleNodeInfo,
	IInternalResolveRecord,
	ResolveRecordNode,
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

export class ResolveRecord implements IInternalResolveRecord {
	get current() {
		return this._current;
	}

	get root() {
		return this._root;
	}

	get id() {
		return this._id;
	}

	get _internalCurrentStack() {
		return this._currentStack;
	}

	private _root: ResolveRecordTreeNode<unknown>;
	private _current: ResolveRecordTreeNode<unknown>;
	private _currentStack: Array<ResolveRecordTreeNode<unknown>> = [];
	private _id: string;
	private _getTreeNodeId = incrementalIdFactory("RESOLVE_RECORD_NODE");

	constructor(container: IContainer) {
		this._id = createResolveRecordId();
		this._root = {
			id: this._getTreeNodeId(),
			value: {
				type: ResolveRecordTypeEnum.root,
				container,
			},
			children: [],
		};
		this._current = this._root;
	}

	addRecordNode(node: ResolveRecordNode<unknown>): void {
		const current = {
			id: this._getTreeNodeId(),
			value: node,
			children: [],
			parent: this._current,
		};
		this._current.children.push(current);
		this._current = current;
	}

	getCycleNode(): undefined | CycleNodeInfo {
		const lastRecordNode = this._current;
		if (!isResolveServiceIdentifierRecord(lastRecordNode.value))
			return undefined;

		let tempRecordNode = lastRecordNode;
		while (tempRecordNode.parent) {
			tempRecordNode = tempRecordNode.parent;

			if (!isResolveServiceIdentifierRecord(tempRecordNode.value)) continue;

			const { dynamic, ref } = tempRecordNode.value.resolveOptions;
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

	getPaths(): Array<ResolveRecordTreeNode<unknown>> {
		const paths: Array<ResolveRecordTreeNode<unknown>> = [];

		let current = this._current;
		while (current.parent) {
			paths.push(current);
			current = current.parent;
		}

		return paths;
	}

	_internalSetCurrent(node: ResolveRecordTreeNode<unknown>) {
		this._current = node;
	}

	_internalStashCurrent() {
		this._currentStack.push(this._current);
	}

	_internalRestoreCurrent() {
		const current = this._currentStack.pop();
		if (!current) {
			throw new Error("No current to restore");
		}
		this._current = current;
	}
}
