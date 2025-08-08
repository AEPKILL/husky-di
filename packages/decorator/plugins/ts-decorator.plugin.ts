import typescript from "typescript";
import type { Vite } from "vitest/node";

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
