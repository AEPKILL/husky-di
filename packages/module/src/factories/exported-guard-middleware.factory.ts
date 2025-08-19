/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-18 22:01:34
 */

import {
	getServiceIdentifierName,
	type IContainer,
	isResolveServiceIdentifierRecord,
	ResolveException,
	type ResolveMiddleware,
	type ResolveRecordTreeNode,
	type ServiceIdentifier,
} from "@husky-di/core";

export function createExportedGuardMiddlewareFactory(
	exports: ServiceIdentifier<unknown>[],
	// biome-ignore lint/suspicious/noExplicitAny: should be any
): ResolveMiddleware<any, any> {
	const exportedSet = new Set(exports);
	return {
		name: "ExportGuard",
		executor(params, next) {
			const { serviceIdentifier, container, resolveRecord } = params;

			const previousContainer = findPreviousContainer(resolveRecord.getPaths());

			// 检查是否是外部访问
			// 检查方式: 如果上一个请求的容器是否是当前容器则可以断定是容器内部访问
			if (previousContainer === container) return next(params);

			// 检查是否是外部访问
			if (!exportedSet.has(serviceIdentifier)) {
				if (container.isRegistered(serviceIdentifier, { recursive: true })) {
					throw new ResolveException(
						`Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not exported from ${container.displayName}.`,
						resolveRecord,
					);
				}
			}

			return next(params);
		},
	};
}

// 找到上一个请求的容器
function findPreviousContainer(
	paths: Array<ResolveRecordTreeNode<unknown>>,
): IContainer | undefined {
	let lastContainer: IContainer | undefined;
	for (const path of paths) {
		if (isResolveServiceIdentifierRecord(path.value)) {
			if (lastContainer) return path.value.container;
			lastContainer = path.value.container;
		}
	}
}
