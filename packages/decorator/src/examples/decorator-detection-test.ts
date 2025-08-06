/**
 * @overview
 * 装饰器检测测试
 * @author AEPKILL
 * @created 2025-01-27
 */

import {
	detectDecoratorModeFromParams,
	isESDecorator,
} from "@/utils/decorator-detector";

// 模拟 ES 装饰器上下文
const mockESContext = {
	kind: "class",
	name: "TestClass",
	addInitializer: () => {},
	metadata: {},
};

// 模拟 TypeScript 装饰器参数
const mockTSContext = "TestClass";

// 测试 ES 装饰器检测
console.log("Testing ES decorator detection:");
console.log("isESDecorator(mockESContext):", isESDecorator(mockESContext));
console.log(
	"detectDecoratorModeFromParams(mockESContext):",
	detectDecoratorModeFromParams(mockESContext),
);

// 测试 TypeScript 装饰器检测
console.log("\nTesting TypeScript decorator detection:");
console.log("isESDecorator(mockTSContext):", isESDecorator(mockTSContext));
console.log(
	"detectDecoratorModeFromParams(mockTSContext):",
	detectDecoratorModeFromParams(mockTSContext),
);

// 测试边界情况
console.log("\nTesting edge cases:");
console.log("isESDecorator(null):", isESDecorator(null));
console.log("isESDecorator(undefined):", isESDecorator(undefined));
console.log("isESDecorator({}):", isESDecorator({}));
console.log("isESDecorator({ kind: 123 }):", isESDecorator({ kind: 123 }));
console.log(
	"isESDecorator({ kind: 'class' }):",
	isESDecorator({ kind: "class" }),
);
