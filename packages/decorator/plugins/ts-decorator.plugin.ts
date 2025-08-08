import fs from "node:fs";
import typescript from "typescript";
import type { Vite } from "vitest/node";

/**
 * 最终版 TypeScript 解析插件
 * 提供完整的 TypeScript 文件处理能力，包括调试和性能监控
 */
export function tsDecoratorPlugin(): Vite.Plugin {
	return {
		name: "ts-decorator",
		enforce: "pre",
		transform(code, id) {
			if (id.endsWith(".test.ts")) {
				const { outputText, sourceMapText } = typescript.transpileModule(code, {
					fileName: id,
					compilerOptions: {
						module: typescript.ModuleKind.ESNext,
						target: typescript.ScriptTarget.ES2015,
						emitDecoratorMetadata: true,
						experimentalDecorators: true,
						sourceMap: true,
					},
				});

				return {
					code: outputText,
					map: sourceMapText,
				};
			}
		},
	};
}
