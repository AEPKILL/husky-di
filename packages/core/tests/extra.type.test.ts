import { describe, expect, it } from "vitest";
import type { Extra } from "../src/types/extra.type";

describe("Extra 类型测试", () => {
	it("应该正确扩展对象类型", () => {
		// 测试基础类型
		type TestType = { name: string; age: number };
		type ExtendedType = Extra<TestType>;

		// 验证类型结构
		const test: ExtendedType = {
			name: "test",
			age: 25,
			// 可以添加额外的属性
			extraProp: "value",
			anotherProp: 123,
		};

		expect(test.name).toBe("test");
		expect(test.age).toBe(25);
		expect(test.extraProp).toBe("value");
		expect(test.anotherProp).toBe(123);
	});

	it("应该保持原有属性的类型", () => {
		type OriginalType = { id: number; title: string };
		type ExtendedType = Extra<OriginalType>;

		const obj: ExtendedType = {
			id: 1,
			title: "测试标题",
			description: "额外描述",
		};

		// 验证原有属性类型保持不变
		expect(typeof obj.id).toBe("number");
		expect(typeof obj.title).toBe("string");
		expect(typeof obj.description).toBe("string");
	});

	it("应该允许添加任意额外属性", () => {
		type BaseType = { x: number; y: number };
		type ExtendedType = Extra<BaseType>;

		const point: ExtendedType = {
			x: 10,
			y: 20,
			// 可以添加任意额外属性
			color: "red",
			visible: true,
			metadata: { layer: "background" },
		};

		expect(point.x).toBe(10);
		expect(point.y).toBe(20);
		expect(point.color).toBe("red");
		expect(point.visible).toBe(true);
		expect(point.metadata).toEqual({ layer: "background" });
	});
});
