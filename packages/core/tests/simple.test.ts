import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type CreateAliasRegistrationOptions,
	type CreateClassRegistrationOptions,
	type CreateFactoryRegistrationOptions,
	type CreateValueRegistrationOptions,
	createContainer,
	createServiceIdentifier,
	globalMiddleware,
	type IContainer,
	type IsRegisteredOptions,
	type ResolveOptions,
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
			expect(container.name).toBe("DefaultContainer");
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
			expect(container.displayName).toBe(`${containerName}#${container.id}`);
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
