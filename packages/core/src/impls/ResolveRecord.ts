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
		this._root = createResolveRecordTreeNode(this._getTreeNodeId(), {
			type: ResolveRecordTypeEnum.root,
			container,
		});
		this._current = this._root;
	}

	addRecordNode(node: ResolveRecordNode<unknown>): void {
		const current = {
			parent: this._current,
			...createResolveRecordTreeNode(this._getTreeNodeId(), node),
		};
		this._current.children.push(current);
		this._current = current;
	}

	getCycleNodes(): undefined | CycleNodeInfo {
		const lastRecordNode = this._current;
		if (!isResolveServiceIdentifierRecord(lastRecordNode.value))
			return undefined;

		let tempRecordNode = lastRecordNode;
		while (tempRecordNode.parent) {
			tempRecordNode = tempRecordNode.parent;
			if (!isResolveServiceIdentifierRecord(tempRecordNode.value)) continue;

			if (
				tempRecordNode.value.resolveOptions.dynamic ||
				tempRecordNode.value.resolveOptions.ref
			) {
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
			if (
				isResolveServiceIdentifierRecord(current.value) ||
				isResolveRootRecord(current.value)
			) {
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
