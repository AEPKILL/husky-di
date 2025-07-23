/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-23 19:53:39
 */

export type TreeNode<T> = {
	readonly value: T;
	readonly children: TreeNode<T>[];
	readonly parent: TreeNode<T> | null;
};

export type Tree<T> = TreeNode<T>[];
