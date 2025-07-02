/**
 * @overview 工具函数 - 唯一ID生成器
 * @author AEPKILL
 * @created 2025-06-24 23:09:59
 */

/**
 * 创建一个递增ID生成器工厂函数
 * @param prefix - 用于ID的前缀
 * @returns 返回一个生成唯一ID的函数
 */
export function incrementalIdFactory(prefix: string = "ID"): () => string {
	let id = 0;
	return () => {
		id++;
		if (id > Number.MAX_SAFE_INTEGER) {
			id = 0;
		}
		return `${prefix}-${id}`;
	};
}

/**
 * 创建容器ID生成器
 * @returns 返回一个生成唯一ID的函数
 */
export const createContainerId = incrementalIdFactory("CONTAINER");

/**
 * 创建模块ID生成器
 * @returns 返回一个生成唯一ID的函数
 */
export const createModuleId = incrementalIdFactory("MODULE");
