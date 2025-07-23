/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-23 19:53:29
 */

import type { TreeNode } from "@/types/tree.type";
import type { Writable } from "@/types/writable.type";

export function appendChild<T>(parent: TreeNode<T>, child: TreeNode<T>) {
	parent.children.push(child);
	(child as Writable<TreeNode<T>>).parent = parent;
}
