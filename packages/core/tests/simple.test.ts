import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createContainer,
	createServiceIdentifier,
	globalMiddleware,
	type IContainer,
	rootContainer,
} from "../src/index";
import { clearContainer, clearMiddleware } from "./test.utils";

/**
 * Test service class
 */
class TestService {
	readonly name: string = "TestService";
}

/**
 * Test service identifier
 */
const ITestService = createServiceIdentifier<TestService>("ITestService");

describe("Container", () => {
	describe("Container Creation", () => {
		it("should create a default container", () => {
			// Arrange & Act
			const container = createContainer();

			// Assert
			expect(container).toBeDefined();
			expect(container.name).toBe("AnonymousContainer");
			expect(container.parent).toBe(rootContainer);
		});

		it("should create a container with a specified name", () => {
			// Arrange
			const containerName = "TestContainer";

			// Act
			const container = createContainer(containerName);

			// Assert
			expect(container).toBeDefined();
			expect(container.name).toBe(containerName);
			expect(container.parent).toBe(rootContainer);
		});

		it("should generate unique IDs for each container", () => {
			// Arrange
			const containerName = "TestContainer";

			// Act
			const container1 = createContainer(containerName);
			const container2 = createContainer(containerName);

			// Assert
			expect(container1.id).not.toBe(container2.id);
			expect(container1.id).toBeDefined();
			expect(container2.id).toBeDefined();
		});

		it("should generate correct display names", () => {
			// Arrange
			const containerName = "TestContainer";

			// Act
			const container = createContainer(containerName);

			// Assert
			expect(container.displayName).toBe(
				`${containerName}#${String(container.id)}`,
			);
		});

		it("should correctly set parent containers", () => {
			// Arrange
			const parentContainer = createContainer("ParentContainer");
			const childContainerName = "ChildContainer";

			// Act
			const childContainer = createContainer(
				childContainerName,
				parentContainer,
			);

			// Assert
			expect(childContainer.parent).toBe(parentContainer);
			expect(childContainer.name).toBe(childContainerName);
		});
	});

	describe("Service Registration and Resolution", () => {
		let container: IContainer;

		beforeEach(() => {
			container = createContainer("TestContainer");
		});

		afterEach(() => {
			// Clean up container state
			if (container) {
				clearContainer(container);
			}
		});

		describe("useClass Registration", () => {
			it("should register and resolve class services", () => {
				// Arrange
				container.register("TestService", {
					useClass: TestService,
				});

				// Act
				const instance = container.resolve<TestService>("TestService");

				// Assert
				expect(instance).toBeDefined();
				expect(instance).toBeInstanceOf(TestService);
				expect(instance.name).toBe("TestService");
			});

			it("should create new instances for each resolution (transient)", () => {
				// Arrange
				container.register("TestService", {
					useClass: TestService,
				});

				// Act
				const instance1 = container.resolve<TestService>("TestService");
				const instance2 = container.resolve<TestService>("TestService");

				// Assert
				expect(instance1).toBeInstanceOf(TestService);
				expect(instance2).toBeInstanceOf(TestService);
				expect(instance1).not.toBe(instance2); // Different instances
			});

			it("should handle class with constructor parameters", () => {
				// Arrange
				class ServiceWithParams {
					constructor(
						public param1: string,
						public param2: number,
					) {}
				}

				container.register("ServiceWithParams", {
					useClass: ServiceWithParams,
				});

				// Act
				const instance =
					container.resolve<ServiceWithParams>("ServiceWithParams");

				// Assert
				expect(instance).toBeInstanceOf(ServiceWithParams);
				expect(instance.param1).toBeUndefined();
				expect(instance.param2).toBeUndefined();
			});

			it("should handle class with default constructor", () => {
				// Arrange
				class ServiceWithDefaults {
					constructor(
						public param1: string = "default1",
						public param2: number = 42,
					) {}
				}

				container.register("ServiceWithDefaults", {
					useClass: ServiceWithDefaults,
				});

				// Act
				const instance = container.resolve<ServiceWithDefaults>(
					"ServiceWithDefaults",
				);

				// Assert
				expect(instance).toBeInstanceOf(ServiceWithDefaults);
				expect(instance.param1).toBe("default1");
				expect(instance.param2).toBe(42);
			});
		});

		describe("useValue Registration", () => {
			it("should register and resolve value services", () => {
				// Arrange
				const testValue = "TestValue";
				container.register("TestValue", {
					useValue: testValue,
				});

				// Act
				const instance = container.resolve("TestValue");

				// Assert
				expect(instance).toBe(testValue);
			});

			it("should return the same instance for each resolution (singleton)", () => {
				// Arrange
				const testValue = { name: "TestObject" };
				container.register("TestObject", {
					useValue: testValue,
				});

				// Act
				const instance1 = container.resolve("TestObject");
				const instance2 = container.resolve("TestObject");

				// Assert
				expect(instance1).toBe(testValue);
				expect(instance2).toBe(testValue);
				expect(instance1).toBe(instance2); // Same instance
			});

			it("should handle primitive values", () => {
				// Arrange
				container.register("StringValue", { useValue: "string" });
				container.register("NumberValue", { useValue: 42 });
				container.register("BooleanValue", { useValue: true });
				container.register("ArrayValue", { useValue: [1, 2, 3] });
				container.register("ObjectValue", { useValue: { key: "value" } });

				// Act & Assert
				expect(container.resolve("StringValue")).toBe("string");
				expect(container.resolve("NumberValue")).toBe(42);
				expect(container.resolve("BooleanValue")).toBe(true);
				expect(container.resolve("ArrayValue")).toEqual([1, 2, 3]);
				expect(container.resolve("ObjectValue")).toEqual({ key: "value" });
			});

			it("should handle null and undefined values", () => {
				// Arrange
				container.register("NullValue", { useValue: null });
				container.register("UndefinedValue", { useValue: undefined });

				// Act & Assert
				expect(container.resolve("NullValue")).toBeNull();
				expect(container.resolve("UndefinedValue")).toBeUndefined();
			});

			it("should handle function values", () => {
				// Arrange
				const testFunction = () => "function result";
				container.register("FunctionValue", { useValue: testFunction });

				// Act
				const result = container.resolve("FunctionValue");

				// Assert
				expect(result).toBe(testFunction);
				expect(typeof result).toBe("function");
			});
		});

		describe("useFactory Registration", () => {
			it("should register and resolve factory services", () => {
				// Arrange
				const testValue = "TestValue";
				container.register("TestFactory", {
					useFactory: () => testValue,
				});

				// Act
				const instance = container.resolve("TestFactory");

				// Assert
				expect(instance).toBe(testValue);
			});

			it("should call factory function for each resolution", () => {
				// Arrange
				let callCount = 0;
				container.register("TestFactory", {
					useFactory: () => {
						callCount++;
						return `Instance${callCount}`;
					},
				});

				// Act
				const instance1 = container.resolve("TestFactory");
				const instance2 = container.resolve("TestFactory");

				// Assert
				expect(instance1).toBe("Instance1");
				expect(instance2).toBe("Instance2");
				expect(callCount).toBe(2);
			});

			it("should handle factory with dependencies", () => {
				// Arrange
				container.register("Param1", { useValue: "value1" });
				container.register("Param2", { useValue: "value2" });
				container.register("TestFactory", {
					useFactory: () => {
						const param1 = container.resolve("Param1");
						const param2 = container.resolve("Param2");
						return `${param1}-${param2}`;
					},
				});

				// Act
				const result = container.resolve("TestFactory");

				// Assert
				expect(result).toBe("value1-value2");
			});

			it("should handle async factory functions", () => {
				// Arrange
				container.register("AsyncFactory", {
					useFactory: async () => {
						return "async result";
					},
				});

				// Act
				const result = container.resolve("AsyncFactory") as Promise<string>;

				// Assert
				expect(result).toBeInstanceOf(Promise);
			});

			it("should handle factory returning complex objects", () => {
				// Arrange
				container.register("ComplexFactory", {
					useFactory: () => ({
						id: 1,
						name: "ComplexObject",
						method: () => "method result",
					}),
				});

				// Act
				const result = container.resolve("ComplexFactory") as {
					id: number;
					name: string;
					method: () => string;
				};

				// Assert
				expect(result).toEqual({
					id: 1,
					name: "ComplexObject",
					method: expect.any(Function),
				});
				expect(result.method()).toBe("method result");
			});
		});

		describe("useAlias Registration", () => {
			it("should register and resolve alias services", () => {
				// Arrange
				const originalValue = "OriginalValue";
				container.register("OriginalService", {
					useValue: originalValue,
				});
				container.register("AliasService", {
					useAlias: "OriginalService",
				});

				// Act
				const original = container.resolve("OriginalService");
				const alias = container.resolve("AliasService");

				// Assert
				expect(original).toBe(originalValue);
				expect(alias).toBe(originalValue);
				expect(alias).toBe(original);
			});

			it("should handle multiple aliases for the same service", () => {
				// Arrange
				const originalValue = { name: "OriginalObject" };
				container.register("OriginalService", {
					useValue: originalValue,
				});
				container.register("Alias1", {
					useAlias: "OriginalService",
				});
				container.register("Alias2", {
					useAlias: "OriginalService",
				});

				// Act
				const original = container.resolve("OriginalService");
				const alias1 = container.resolve("Alias1");
				const alias2 = container.resolve("Alias2");

				// Assert
				expect(original).toBe(originalValue);
				expect(alias1).toBe(originalValue);
				expect(alias2).toBe(originalValue);
				expect(alias1).toBe(alias2);
			});

			it("should handle chained aliases", () => {
				// Arrange
				const originalValue = "OriginalValue";
				container.register("OriginalService", {
					useValue: originalValue,
				});
				container.register("FirstAlias", {
					useAlias: "OriginalService",
				});
				container.register("SecondAlias", {
					useAlias: "FirstAlias",
				});

				// Act
				const original = container.resolve("OriginalService");
				const firstAlias = container.resolve("FirstAlias");
				const secondAlias = container.resolve("SecondAlias");

				// Assert
				expect(original).toBe(originalValue);
				expect(firstAlias).toBe(originalValue);
				expect(secondAlias).toBe(originalValue);
			});

			it("should throw error when alias target is not registered", () => {
				// Arrange
				container.register("AliasService", {
					useAlias: "NonExistentService",
				});

				// Act & Assert
				expect(() => {
					container.resolve("AliasService");
				}).toThrow(/Service identifier "NonExistentService" is not registered/);
			});

			it("should handle alias to class service", () => {
				// Arrange
				container.register("ClassService", {
					useClass: TestService,
				});
				container.register("ClassAlias", {
					useAlias: "ClassService",
				});

				// Act
				const original = container.resolve<TestService>("ClassService");
				const alias = container.resolve<TestService>("ClassAlias");

				// Assert
				expect(original).toBeInstanceOf(TestService);
				expect(alias).toBeInstanceOf(TestService);
				expect(original.name).toBe("TestService");
				expect(alias.name).toBe("TestService");
			});

			it("should handle alias to factory service", () => {
				// Arrange
				container.register("FactoryService", {
					useFactory: () => "factory result",
				});
				container.register("FactoryAlias", {
					useAlias: "FactoryService",
				});

				// Act
				const original = container.resolve("FactoryService");
				const alias = container.resolve("FactoryAlias");

				// Assert
				expect(original).toBe("factory result");
				expect(alias).toBe("factory result");
			});
		});

		describe("Mixed Registration Types", () => {
			it("should handle mixed registration types in same container", () => {
				// Arrange
				container.register("ClassService", { useClass: TestService });
				container.register("ValueService", { useValue: "value" });
				container.register("FactoryService", { useFactory: () => "factory" });
				container.register("AliasService", { useAlias: "ValueService" });

				// Act
				const classResult = container.resolve<TestService>("ClassService");
				const valueResult = container.resolve("ValueService");
				const factoryResult = container.resolve("FactoryService");
				const aliasResult = container.resolve("AliasService");

				// Assert
				expect(classResult).toBeInstanceOf(TestService);
				expect(valueResult).toBe("value");
				expect(factoryResult).toBe("factory");
				expect(aliasResult).toBe("value");
			});

			it("should allow multiple registrations of same service with different types", () => {
				// Arrange
				container.register("TestService", { useClass: TestService });
				container.register("TestService", { useValue: "override" });

				// Act
				const result = container.resolve("TestService");

				// Assert
				expect(result).toBe("override"); // Last registration wins
			});
		});

		it("should resolve multiple services with the same identifier", () => {
			// Arrange
			container.register(ITestService, {
				useClass: TestService,
			});
			container.register(ITestService, {
				useClass: TestService,
			});

			// Act
			const instances = container.resolve(ITestService, {
				multiple: true,
			});

			// Assert
			expect(instances).toBeDefined();
			expect(Array.isArray(instances)).toBe(true);
			expect(instances.length).toBe(2);
			expect(instances[0]).toBeInstanceOf(TestService);
			expect(instances[1]).toBeInstanceOf(TestService);
			expect(instances[0].name).toBe("TestService");
			expect(instances[1].name).toBe("TestService");
		});

		it("should resolve a single service (default behavior)", () => {
			// Arrange
			container.register(ITestService, {
				useClass: TestService,
			});

			// Act
			const instance = container.resolve(ITestService);

			// Assert
			expect(instance).toBeDefined();
			expect(instance).toBeInstanceOf(TestService);
			expect(instance.name).toBe("TestService");
		});
	});

	describe("Middleware Functionality", () => {
		let container: IContainer;

		beforeEach(() => {
			container = createContainer("TestContainer");
		});

		afterEach(() => {
			// Clean up container and global middleware
			if (container) {
				clearContainer(container);
			}
			// Clean up global middleware
			clearMiddleware(globalMiddleware);
		});

		it("should apply container-level middleware", () => {
			// Arrange
			container.register("TestValue", {
				useFactory: () => "TestValue",
			});
			container.use({
				name: "TestMiddleware",
				executor: (params, next) => {
					return `${next(params) as string}TestMiddleware`;
				},
			});

			// Act
			const instance = container.resolve("TestValue");

			// Assert
			expect(instance).toBe("TestValueTestMiddleware");
		});

		it("should apply global middleware", () => {
			// Arrange
			container.register("TestValue", {
				useFactory: () => "TestValue",
			});
			globalMiddleware.use({
				name: "GlobalTestMiddleware",
				executor: (params, next) => {
					return `${next(params) as string}GlobalMiddleware`;
				},
			});

			// Act
			const instance = container.resolve("TestValue");

			// Assert
			expect(instance).toBe("TestValueGlobalMiddleware");
		});

		it("should apply multiple middleware in sequence", () => {
			// Arrange
			container.register("TestValue", {
				useFactory: () => "TestValue",
			});
			container.use({
				name: "FirstMiddleware",
				executor: (params, next) => {
					return `${next(params) as string}First`;
				},
			});
			container.use({
				name: "SecondMiddleware",
				executor: (params, next) => {
					return `${next(params) as string}Second`;
				},
			});

			// Act
			const instance = container.resolve("TestValue");

			// Assert
			expect(instance).toBe("TestValueFirstSecond");
		});
	});

	describe("Edge Cases and Error Handling", () => {
		let container: IContainer;

		beforeEach(() => {
			container = createContainer("TestContainer");
		});

		afterEach(() => {
			if (container) {
				clearContainer(container);
			}
		});

		it("should throw an error when resolving unregistered services", () => {
			// Act & Assert
			expect(() => {
				container.resolve("NonExistentService");
			}).toThrow();
		});

		it("should handle duplicate service registrations correctly", () => {
			// Arrange
			container.register("TestService", {
				useClass: TestService,
			});

			// Act & Assert - Duplicate registrations should be allowed
			expect(() => {
				container.register("TestService", {
					useClass: TestService,
				});
			}).not.toThrow();
		});

		it("should check if services are registered", () => {
			// Arrange
			container.register("TestService", {
				useClass: TestService,
			});

			// Act & Assert
			expect(container.isRegistered("TestService")).toBe(true);
			expect(container.isRegistered("NonExistentService")).toBe(false);
		});

		it("should handle null value registrations correctly", () => {
			// Arrange
			container.register("NullValue", {
				useValue: null,
			});

			// Act
			const instance = container.resolve("NullValue");

			// Assert
			expect(instance).toBeNull();
		});

		it("should handle undefined value registrations correctly", () => {
			// Arrange
			container.register("UndefinedValue", {
				useValue: undefined,
			});

			// Act
			const instance = container.resolve("UndefinedValue");

			// Assert
			expect(instance).toBeUndefined();
		});
	});
});
