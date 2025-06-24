import { beforeEach, describe, expect, it } from "vitest";
import {
	clearNamespaceCounter,
	createIdGenerator,
	createIncrementalId,
	createNamespacedId,
	createPrefixedId,
	createPrefixedIdGenerator,
	createTimestampId,
	getCurrentGlobalCounter,
	getNamespaceCounter,
	resetGlobalCounter,
	resetNamespaceCounter,
	squared,
} from "../src/index";

describe("squared", () => {
	it("should return the square of a number", () => {
		expect(squared(2)).toBe(4);
		expect(squared(3)).toBe(9);
		expect(squared(4)).toBe(16);
	});
});

describe("自增 ID 工具函数", () => {
	beforeEach(() => {
		// 每个测试前重置计数器
		resetGlobalCounter();
		clearNamespaceCounter();
	});

	describe("createIncrementalId", () => {
		it("应该从 1 开始生成自增 ID", () => {
			expect(createIncrementalId()).toBe(1);
			expect(createIncrementalId()).toBe(2);
			expect(createIncrementalId()).toBe(3);
		});

		it("应该支持自定义起始值", () => {
			resetGlobalCounter();
			expect(createIncrementalId(100)).toBe(100);
			expect(createIncrementalId()).toBe(101);
		});

		it("应该支持自定义步长", () => {
			resetGlobalCounter();
			expect(createIncrementalId(1, 5)).toBe(1);
			expect(createIncrementalId(1, 5)).toBe(6);
			expect(createIncrementalId(1, 5)).toBe(11);
		});
	});

	describe("resetGlobalCounter", () => {
		it("应该重置全局计数器", () => {
			createIncrementalId(); // 1
			createIncrementalId(); // 2
			resetGlobalCounter(10);
			expect(createIncrementalId()).toBe(11);
		});
	});

	describe("getCurrentGlobalCounter", () => {
		it("应该返回当前计数器值", () => {
			expect(getCurrentGlobalCounter()).toBe(0);
			createIncrementalId(); // 1
			expect(getCurrentGlobalCounter()).toBe(1);
			createIncrementalId(); // 2
			expect(getCurrentGlobalCounter()).toBe(2);
		});
	});

	describe("createNamespacedId", () => {
		it("应该为不同命名空间维护独立计数器", () => {
			expect(createNamespacedId("user")).toBe(1);
			expect(createNamespacedId("user")).toBe(2);
			expect(createNamespacedId("order")).toBe(1); // 独立计数
			expect(createNamespacedId("order")).toBe(2);
			expect(createNamespacedId("user")).toBe(3); // 继续原来的计数
		});

		it("应该支持自定义起始值和步长", () => {
			expect(createNamespacedId("test", 100, 5)).toBe(100);
			expect(createNamespacedId("test", 100, 5)).toBe(105);
		});
	});

	describe("resetNamespaceCounter", () => {
		it("应该重置指定命名空间的计数器", () => {
			createNamespacedId("user"); // 1
			createNamespacedId("user"); // 2
			resetNamespaceCounter("user", 10);
			expect(createNamespacedId("user")).toBe(11);
		});
	});

	describe("getNamespaceCounter", () => {
		it("应该返回命名空间当前计数器值", () => {
			expect(getNamespaceCounter("user")).toBe(0);
			createNamespacedId("user"); // 1
			expect(getNamespaceCounter("user")).toBe(1);
		});
	});

	describe("clearNamespaceCounter", () => {
		it("应该清除指定命名空间", () => {
			createNamespacedId("user"); // 1
			clearNamespaceCounter("user");
			expect(getNamespaceCounter("user")).toBe(0);
		});

		it("应该清除所有命名空间", () => {
			createNamespacedId("user"); // 1
			createNamespacedId("order"); // 1
			clearNamespaceCounter();
			expect(getNamespaceCounter("user")).toBe(0);
			expect(getNamespaceCounter("order")).toBe(0);
		});
	});

	describe("createPrefixedId", () => {
		it("应该生成带前缀的 ID", () => {
			expect(createPrefixedId("USER")).toBe("USER1");
			expect(createPrefixedId("USER")).toBe("USER2");
		});

		it("应该支持命名空间", () => {
			expect(createPrefixedId("USER", "user")).toBe("USER1");
			expect(createPrefixedId("ORDER", "order")).toBe("ORDER1");
			expect(createPrefixedId("USER", "user")).toBe("USER2");
		});

		it("应该支持数字填充", () => {
			expect(createPrefixedId("USER", "user", 4)).toBe("USER0001");
			expect(createPrefixedId("USER", "user", 4)).toBe("USER0002");
		});
	});

	describe("createIdGenerator", () => {
		it("应该创建独立的 ID 生成器", () => {
			const gen1 = createIdGenerator(1, 1);
			const gen2 = createIdGenerator(100, 10);

			expect(gen1()).toBe(1);
			expect(gen1()).toBe(2);
			expect(gen2()).toBe(100);
			expect(gen2()).toBe(110);
			expect(gen1()).toBe(3); // gen1 不受 gen2 影响
		});
	});

	describe("createPrefixedIdGenerator", () => {
		it("应该创建带前缀的 ID 生成器", () => {
			const userGen = createPrefixedIdGenerator("USER_", 4, 1000);
			const orderGen = createPrefixedIdGenerator("ORD");

			expect(userGen()).toBe("USER_1000");
			expect(userGen()).toBe("USER_1001");
			expect(orderGen()).toBe("ORD1");
			expect(orderGen()).toBe("ORD2");
		});
	});

	describe("createTimestampId", () => {
		it("应该生成时间戳 + 自增的混合 ID", () => {
			const id1 = createTimestampId();
			const id2 = createTimestampId();

			expect(typeof id1).toBe("string");
			expect(typeof id2).toBe("string");
			expect(id1).not.toBe(id2);
			expect(id1.length).toBeGreaterThan(10); // 基本长度检查
		});

		it("应该支持不同的时间戳格式", () => {
			const fullId = createTimestampId(undefined, "full");
			const shortId = createTimestampId(undefined, "short");
			const msId = createTimestampId(undefined, "ms");

			expect(fullId.length).toBeGreaterThan(shortId.length);
			expect(typeof fullId).toBe("string");
			expect(typeof shortId).toBe("string");
			expect(typeof msId).toBe("string");
		});

		it("应该支持命名空间", () => {
			const id1 = createTimestampId("test1");
			const id2 = createTimestampId("test2");
			const id3 = createTimestampId("test1");

			expect(id1).not.toBe(id2);
			expect(id1).not.toBe(id3);
		});
	});
});
