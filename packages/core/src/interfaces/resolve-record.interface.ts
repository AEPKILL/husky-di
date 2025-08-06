/**
 * @overview 依赖解析记录相关的类型定义
 * @author AEPKILL
 * @created 2025-07-29 22:55:24
 *
 * 类型关系说明：
 *
 * 1. ResolveRecordNode<T> - 解析记录节点（叶子节点）
 *    - RootResolveRecordNode: 根节点，表示解析开始
 *    - MessageResolveRecordNode: 消息节点，用于记录解析过程中的消息
 *    - ServiceIdentifierResolveRecordNode<T>: 服务标识符节点，记录具体的服务解析
 *
 * 2. ResolveRecordTreeNode<T> - 解析记录树节点（树结构）
 *    - 包含父子关系，形成树形结构
 *    - 每个节点包含一个 ResolveRecordNode<T> 作为值
 *    - 用于追踪依赖解析的完整路径
 *
 * 3. IResolveRecord - 解析记录接口
 *    - 管理整个解析过程的状态
 *    - 提供当前节点、根节点访问
 *    - 支持添加节点、检测循环引用、获取路径等功能
 *
 * 4. IInternalResolveRecord - 内部解析记录接口
 *    - 扩展 IResolveRecord，添加设置当前节点的功能
 *    - 主要用于内部实现
 */

import type { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import type {
	IContainer,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IUnique } from "@/interfaces/unique.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type RootResolveRecordNode = {
	readonly type: ResolveRecordTypeEnum.root;
	readonly container: IContainer;
};

export type MessageResolveRecordNode = {
	readonly type: ResolveRecordTypeEnum.message;
	readonly message: string;
};

export type ServiceIdentifierResolveRecordNode<T> = {
	readonly type: ResolveRecordTypeEnum.serviceIdentifier;
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

export type CycleNodeInfo = {
	cycleNode: ResolveRecordTreeNode<unknown>;
};

export interface IResolveRecord extends IUnique {
	readonly current: ResolveRecordTreeNode<unknown>;
	readonly root: ResolveRecordTreeNode<unknown>;

	addRecordNode(node: ResolveRecordNode<unknown>): void;

	getCycleNodes(): undefined | CycleNodeInfo;

	getPaths(): Array<ResolveRecordTreeNode<unknown>>;

	getCurrentContainer(): IContainer | undefined;
}

export interface IInternalResolveRecord extends IResolveRecord {
	readonly currentStack: Array<ResolveRecordTreeNode<unknown>>;
	setCurrent(node: ResolveRecordTreeNode<unknown>): void;
	stashCurrent(): void;
	restoreCurrent(): void;
}
