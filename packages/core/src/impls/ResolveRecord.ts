/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 23:36:01
 */

import { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	IInternalResolveRecord,
	ResolveRecordNode,
	ResolveRecordTreeNode,
} from "@/interfaces/resolve-record.interface";
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

	private _root: ResolveRecordTreeNode<unknown>;
	private _current: ResolveRecordTreeNode<unknown>;
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

	getCycleNodes(): ResolveRecordTreeNode<unknown>[] {
		return [];
	}

	setCurrent(node: ResolveRecordTreeNode<unknown>) {
		this._current = node;
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
