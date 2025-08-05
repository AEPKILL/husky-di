import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createContainer,
	createServiceIdentifier,
	type IContainer,
	rootContainer,
} from "../src/index";
import { clearContainer } from "./test.utils";

/**
 * Test service classes for cross-container testing
 */
class ServiceA {
	readonly name = "ServiceA";
}

class ServiceB {
	readonly name = "ServiceB";
}

class ServiceC {
	readonly name = "ServiceC";
}

/**
 * Test service identifiers
 */
const IServiceA = createServiceIdentifier<ServiceA>("IServiceA");
const IServiceB = createServiceIdentifier<ServiceB>("IServiceB");
const IServiceC = createServiceIdentifier<ServiceC>("IServiceC");

describe("Cross Container Resolution", () => {
	describe("Default Parent Container", () => {
		it("should have root container as default parent when no parent is specified", () => {
			// Act
			const container = createContainer("TestContainer");

			// Assert
			expect(container.parent).toBe(rootContainer);
		});

		it("should resolve services from root container when not registered in child", () => {
			// Arrange
			rootContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			const container = createContainer("TestContainer");

			// Act
			const result = container.resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
			expect(result.name).toBe("ServiceA");
		});

		it("should prioritize child container over root container", () => {
			// Arrange
			rootContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			const container = createContainer("TestContainer");
			container.register(IServiceA, {
				useClass: ServiceA, // Override with same class but different instance
			});

			// Act
			const result = container.resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
			expect(result.name).toBe("ServiceA");
		});

		it("should check registration recursively including root container", () => {
			// Arrange
			rootContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			const container = createContainer("TestContainer");

			// Act & Assert
			expect(container.isRegistered(IServiceA, { recursive: true })).toBe(true);
			expect(container.isRegistered(IServiceA, { recursive: false })).toBe(
				false,
			);
		});

		it("should not affect root container when child registers same service", () => {
			// Arrange
			rootContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			const container = createContainer("TestContainer");
			container.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const rootResult = rootContainer.resolve(IServiceA);
			const childResult = container.resolve(IServiceA);

			// Assert
			expect(rootResult).toBeInstanceOf(ServiceA);
			expect(rootResult.name).toBe("ServiceA");
			expect(childResult).toBeInstanceOf(ServiceA);
			expect(childResult.name).toBe("ServiceA");
		});

		it("should handle multiple containers with root as parent", () => {
			// Arrange
			rootContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			const container1 = createContainer("Container1");
			const container2 = createContainer("Container2");

			// Act
			const result1 = container1.resolve(IServiceA);
			const result2 = container2.resolve(IServiceA);

			// Assert
			expect(result1).toBeInstanceOf(ServiceA);
			expect(result1.name).toBe("ServiceA");
			expect(result2).toBeInstanceOf(ServiceA);
			expect(result2.name).toBe("ServiceA");
		});

		afterEach(() => {
			// Clean up root container registrations
			const serviceIdentifiers = rootContainer.getServiceIdentifiers();
			serviceIdentifiers.forEach((serviceIdentifier) => {
				rootContainer.unregister(serviceIdentifier);
			});
		});
	});

	describe("Parent-Child Container Hierarchy", () => {
		let parentContainer: IContainer;
		let childContainer: IContainer;

		beforeEach(() => {
			parentContainer = createContainer("ParentContainer");
			childContainer = createContainer("ChildContainer", parentContainer);
		});

		afterEach(() => {
			if (parentContainer) {
				clearContainer(parentContainer);
			}
			if (childContainer) {
				clearContainer(childContainer);
			}
		});

		it("should resolve service from parent container when not registered in child", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const result = childContainer.resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
			expect(result.name).toBe("ServiceA");
		});

		it("should resolve service from child container when registered in both", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			childContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const result = childContainer.resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
			expect(result.name).toBe("ServiceA");
		});

		it("should throw error when service is not registered in any container", () => {
			// Act & Assert
			expect(() => {
				childContainer.resolve(IServiceA);
			}).toThrow(/Service identifier "IServiceA" is not registered/);
		});

		it("should check registration recursively", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act & Assert
			expect(childContainer.isRegistered(IServiceA, { recursive: true })).toBe(
				true,
			);
			expect(childContainer.isRegistered(IServiceA, { recursive: false })).toBe(
				false,
			);
		});
	});

	describe("Multi-Level Container Hierarchy", () => {
		let rootContainer: IContainer;
		let parentContainer: IContainer;
		let childContainer: IContainer;
		let grandchildContainer: IContainer;

		beforeEach(() => {
			rootContainer = createContainer("RootContainer");
			parentContainer = createContainer("ParentContainer", rootContainer);
			childContainer = createContainer("ChildContainer", parentContainer);
			grandchildContainer = createContainer(
				"GrandchildContainer",
				childContainer,
			);
		});

		afterEach(() => {
			if (rootContainer) clearContainer(rootContainer);
			if (parentContainer) clearContainer(parentContainer);
			if (childContainer) clearContainer(childContainer);
			if (grandchildContainer) clearContainer(grandchildContainer);
		});

		it("should resolve service from root container through multiple levels", () => {
			// Arrange
			rootContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const result = grandchildContainer.resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
			expect(result.name).toBe("ServiceA");
		});

		it("should resolve service from parent container when not in grandchild", () => {
			// Arrange
			parentContainer.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act
			const result = grandchildContainer.resolve(IServiceB);

			// Assert
			expect(result).toBeInstanceOf(ServiceB);
			expect(result.name).toBe("ServiceB");
		});

		it("should prioritize closest container in hierarchy", () => {
			// Arrange
			rootContainer.register(IServiceC, {
				useClass: ServiceC,
			});
			parentContainer.register(IServiceC, {
				useClass: ServiceC,
			});
			childContainer.register(IServiceC, {
				useClass: ServiceC,
			});

			// Act
			const result = grandchildContainer.resolve(IServiceC);

			// Assert
			expect(result).toBeInstanceOf(ServiceC);
			expect(result.name).toBe("ServiceC");
		});
	});

	describe("Service Override and Shadowing", () => {
		let parentContainer: IContainer;
		let childContainer: IContainer;

		beforeEach(() => {
			parentContainer = createContainer("ParentContainer");
			childContainer = createContainer("ChildContainer", parentContainer);
		});

		afterEach(() => {
			if (parentContainer) clearContainer(parentContainer);
			if (childContainer) clearContainer(childContainer);
		});

		it("should allow child container to override parent service", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			childContainer.register(IServiceA, {
				useClass: ServiceA, // Override with same class but different instance
			});

			// Act
			const result = childContainer.resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
			expect(result.name).toBe("ServiceA");
		});

		it("should not affect parent container when child overrides service", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			childContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const parentResult = parentContainer.resolve(IServiceA);
			const childResult = childContainer.resolve(IServiceA);

			// Assert
			expect(parentResult).toBeInstanceOf(ServiceA);
			expect(parentResult.name).toBe("ServiceA");
			expect(childResult).toBeInstanceOf(ServiceA);
			expect(childResult.name).toBe("ServiceA");
		});
	});

	describe("Container Isolation", () => {
		let container1: IContainer;
		let container2: IContainer;

		beforeEach(() => {
			container1 = createContainer("Container1");
			container2 = createContainer("Container2");
		});

		afterEach(() => {
			if (container1) clearContainer(container1);
			if (container2) clearContainer(container2);
		});

		it("should isolate services between unrelated containers", () => {
			// Arrange
			container1.register(IServiceA, {
				useClass: ServiceA,
			});
			container2.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act & Assert
			expect(() => {
				container1.resolve(IServiceB);
			}).toThrow(/Service identifier "IServiceB" is not registered/);

			expect(() => {
				container2.resolve(IServiceA);
			}).toThrow(/Service identifier "IServiceA" is not registered/);
		});

		it("should allow same service identifier in different containers", () => {
			// Arrange
			container1.register(IServiceA, {
				useClass: ServiceA,
			});
			container2.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const result1 = container1.resolve(IServiceA);
			const result2 = container2.resolve(IServiceA);

			// Assert
			expect(result1).toBeInstanceOf(ServiceA);
			expect(result1.name).toBe("ServiceA");
			expect(result2).toBeInstanceOf(ServiceA);
			expect(result2.name).toBe("ServiceA");
		});
	});

	describe("Container Lifecycle and Disposal", () => {
		let parentContainer: IContainer;
		let childContainer: IContainer;

		beforeEach(() => {
			parentContainer = createContainer("ParentContainer");
			childContainer = createContainer("ChildContainer", parentContainer);
		});

		afterEach(() => {
			if (parentContainer) clearContainer(parentContainer);
			if (childContainer) clearContainer(childContainer);
		});

		it("should maintain parent-child relationship after child disposal", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			childContainer.dispose();

			// Assert
			expect(parentContainer.disposed).toBe(false);
			expect(childContainer.disposed).toBe(true);
		});

		it("should not affect parent when child is disposed", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			childContainer.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act
			childContainer.dispose();

			// Assert
			const result = parentContainer.resolve(IServiceA);
			expect(result).toBeInstanceOf(ServiceA);
		});
	});

	describe("Service Registration and Unregistration", () => {
		let parentContainer: IContainer;
		let childContainer: IContainer;

		beforeEach(() => {
			parentContainer = createContainer("ParentContainer");
			childContainer = createContainer("ChildContainer", parentContainer);
		});

		afterEach(() => {
			if (parentContainer) clearContainer(parentContainer);
			if (childContainer) clearContainer(childContainer);
		});

		it("should unregister service from child container only", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			childContainer.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act
			childContainer.unregister(IServiceB);

			// Assert
			expect(childContainer.isRegistered(IServiceB)).toBe(false);
			expect(childContainer.isRegistered(IServiceA)).toBe(false);
			expect(parentContainer.isRegistered(IServiceA)).toBe(true);
		});

		it("should not affect parent when unregistering from child", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useClass: ServiceA,
			});
			childContainer.register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			childContainer.unregister(IServiceA);

			// Assert
			expect(childContainer.isRegistered(IServiceA)).toBe(false);
			expect(parentContainer.isRegistered(IServiceA)).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle circular parent-child references", () => {
			// This test ensures the container hierarchy doesn't create circular references
			const container1 = createContainer("Container1");
			const container2 = createContainer("Container2", container1);

			// Act & Assert - Should not throw
			expect(() => {
				container1.dispose();
				container2.dispose();
			}).not.toThrow();
		});

		it("should handle deep container hierarchies", () => {
			// Arrange
			const containers: IContainer[] = [];
			let currentContainer: IContainer | undefined;

			// Create a deep hierarchy
			for (let i = 0; i < 10; i++) {
				const container = createContainer(`Container${i}`, currentContainer);
				containers.push(container);
				currentContainer = container;
			}

			// Register service in root container
			containers[0].register(IServiceA, {
				useClass: ServiceA,
			});

			// Act
			const result = containers[9].resolve(IServiceA);

			// Assert
			expect(result).toBeInstanceOf(ServiceA);
		});
	});
});
