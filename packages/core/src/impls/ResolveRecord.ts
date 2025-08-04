/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 23:36:01
 */

import { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	CycleNodeInfo,
	IInternalResolveRecord,
	ResolveRecordNode,
	ResolveRecordTreeNode,
} from "@/interfaces/resolve-record.interface";
import {
	isEqualServiceIdentifierResolveRecord,
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

	get currentStack() {
		return this._currentStack;
	}

	private _root: ResolveRecordTreeNode<unknown>;
	private _current: ResolveRecordTreeNode<unknown>;
	private _currentStack: Array<ResolveRecordTreeNode<unknown>> = [];
	private _id: string;
	private _getTreeNodeId = incrementalIdFactory("RESOLVE_RECORD_NODE");

	constructor(container: IContainer) {
		this._id = createResolveRecordId();
		this._root = createResolveRecordTreeNode(this._getTreeNodeId(), {
			type: ResolveIdentifierRecordTypeEnum.root,
			container,
		});
		this._current = this._root;
	}
	addRecordNode(node: ResolveRecordNode<unknown>): void {
		this._current.children.push({
			parent: this._current,
			...createResolveRecordTreeNode(this._getTreeNodeId(), node),
		});
	}

	getCycleNodes(): undefined | CycleNodeInfo {
		const lastRecordNode = this._current;
		if (!isResolveServiceIdentifierRecord(lastRecordNode.value))
			return undefined;

		let tempRecordNode = lastRecordNode;
		while (tempRecordNode.parent) {
			tempRecordNode = tempRecordNode.parent;
			if (!isResolveServiceIdentifierRecord(tempRecordNode.value)) continue;

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

	getPaths(): Array<ResolveRecordTreeNode<unknown>> {
		const paths: Array<ResolveRecordTreeNode<unknown>> = [];

		let current = this._current;
		while (current.parent) {
			paths.push(current);
			current = current.parent;
		}

		return paths;
	}

	setCurrent(node: ResolveRecordTreeNode<unknown>) {
		this._current = node;
	}

	stashCurrent() {
		this._currentStack.push(this._current);
	}

	restoreCurrent() {
		const current = this._currentStack.pop();
		if (!current) {
			throw new Error("No current to restore");
		}
		this._current = current;
	}
}

function createResolveRecordTreeNode<T>(
	id: string,
	value: ResolveRecordNode<T>,
): ResolveRecordTreeNode<T> {
	return {
		id,
		value,
		children: [],
	};
}
