/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-18 22:01:34
 */

import {
	getServiceIdentifierName,
	type IContainer,
	isResolveServiceIdentifierRecord,
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

			// 检查是否是外部访问
			const preRequestContainer = findPreRequestContainer(
				resolveRecord.getPaths(),
			);

			// 容器内部访问，直接放行
			if (preRequestContainer === container) return next(params);

			// 检查是否是外部访问
			if (!exportedSet.has(serviceIdentifier)) {
				if (container.isRegistered(serviceIdentifier, { recursive: true })) {
					throw new Error(
						`Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not exported from  ${container.displayName}.`,
					);
				}
			}

			return next(params);
		},
	};
}

// 找到上一个请求的容器
function findPreRequestContainer(paths: Array<ResolveRecordTreeNode<unknown>>) {
	let lastContainer: IContainer | undefined;
	for (const path of paths) {
		if (isResolveServiceIdentifierRecord(path.value)) {
			if (lastContainer) return path.value.container;
			lastContainer = path.value.container;
		}
	}
	return lastContainer;
}
