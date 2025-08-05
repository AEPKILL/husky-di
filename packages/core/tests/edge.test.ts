import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createContainer,
	createServiceIdentifier,
	type IContainer,
	LifecycleEnum,
} from "../src/index";
import { clearContainer } from "./test.utils";

/**
 * Test service classes for edge case testing
 */
class ServiceA1 {
	readonly name = "ServiceA1";
	readonly id = 1;
}

class ServiceA2 {
	readonly name = "ServiceA2";
	readonly id = 2;
}

class ServiceA3 {
	readonly name = "ServiceA3";
	readonly id = 3;
}

class ServiceA4 {
	readonly name = "ServiceA4";
	readonly id = 4;
}

class ServiceA5 {
	readonly name = "ServiceA5";
	readonly id = 5;
}

/**
 * Test service identifier
 */
const IServiceA = createServiceIdentifier<
	ServiceA1 | ServiceA2 | ServiceA3 | ServiceA4 | ServiceA5
>("IServiceA");

describe("Edge Cases", () => {
	describe("Multiple Registration Resolution", () => {
		let container: IContainer;

		beforeEach(() => {
			container = createContainer("TestContainer");
		});

		afterEach(() => {
			if (container) {
				clearContainer(container);
			}
		});

		it("should resolve multiple instances and single instance correctly", () => {
			// Arrange - Register 5 different classes for the same service identifier
			container.register(IServiceA, {
				useClass: ServiceA1,
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceA, {
				useClass: ServiceA2,
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceA, {
				useClass: ServiceA3,
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceA, {
				useClass: ServiceA4,
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceA, {
				useClass: ServiceA5,
				lifecycle: LifecycleEnum.resolution,
			});

			// Act - First resolve multiple instances
			const multipleInstances = container.resolve(IServiceA, {
				multiple: true,
			});

			// Act - Then resolve single instance
			const singleInstance = container.resolve(IServiceA);

			// Assert - Verify multiple instances
			expect(multipleInstances).toBeDefined();
			expect(Array.isArray(multipleInstances)).toBe(true);
			expect(multipleInstances.length).toBe(5);

			// Verify each instance is of the correct class
			expect(multipleInstances[0]).toBeInstanceOf(ServiceA1);
			expect(multipleInstances[1]).toBeInstanceOf(ServiceA2);
			expect(multipleInstances[2]).toBeInstanceOf(ServiceA3);
			expect(multipleInstances[3]).toBeInstanceOf(ServiceA4);
			expect(multipleInstances[4]).toBeInstanceOf(ServiceA5);

			// Verify instance properties
			expect(multipleInstances[0].name).toBe("ServiceA1");
			expect(multipleInstances[1].name).toBe("ServiceA2");
			expect(multipleInstances[2].name).toBe("ServiceA3");
			expect(multipleInstances[3].name).toBe("ServiceA4");
			expect(multipleInstances[4].name).toBe("ServiceA5");

			expect(multipleInstances[0].id).toBe(1);
			expect(multipleInstances[1].id).toBe(2);
			expect(multipleInstances[2].id).toBe(3);
			expect(multipleInstances[3].id).toBe(4);
			expect(multipleInstances[4].id).toBe(5);

			// Assert - Verify single instance equals the last instance from multiple resolve
			expect(singleInstance).toBeDefined();
			expect(singleInstance).toBeInstanceOf(ServiceA5);
			expect(singleInstance.name).toBe("ServiceA5");
			expect(singleInstance.id).toBe(5);

			// Verify single instance is the same as the last instance from multiple resolve
			expect(singleInstance).toBe(multipleInstances[4]);
		});

		it("should maintain resolution lifecycle for multiple registrations", () => {
			// Arrange - Register with resolution lifecycle
			container.register(IServiceA, {
				useClass: ServiceA1,
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceA, {
				useClass: ServiceA2,
				lifecycle: LifecycleEnum.resolution,
			});

			// Act - Resolve multiple times
			const firstMultiple = container.resolve(IServiceA, {
				multiple: true,
			});
			const secondMultiple = container.resolve(IServiceA, {
				multiple: true,
			});
			const single1 = container.resolve(IServiceA);
			const single2 = container.resolve(IServiceA);

			// Assert - With resolution lifecycle, instances should be the same within the same resolution context
			// The resolution lifecycle maintains the same instance within the same resolution context
			expect(firstMultiple[0]).toBe(secondMultiple[0]);
			expect(firstMultiple[1]).toBe(secondMultiple[1]);
			expect(single1).toBe(single2);
			expect(single1).toBe(firstMultiple[1]); // Single resolve returns the last instance
			expect(single2).toBe(secondMultiple[1]);
		});

		it("should handle mixed registration types with multiple resolve", () => {
			// Arrange - Mix different registration types
			container.register(IServiceA, {
				useClass: ServiceA1,
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceA, {
				useValue: { name: "ServiceA2", id: 2 },
			});
			container.register(IServiceA, {
				useClass: ServiceA3,
				lifecycle: LifecycleEnum.resolution,
			});

			// Act
			const multipleInstances = container.resolve(IServiceA, {
				multiple: true,
			});
			const singleInstance = container.resolve(IServiceA);

			// Assert
			expect(multipleInstances).toBeDefined();
			expect(Array.isArray(multipleInstances)).toBe(true);
			expect(multipleInstances.length).toBe(3);

			expect(multipleInstances[0]).toBeInstanceOf(ServiceA1);
			expect(multipleInstances[1]).toEqual({ name: "ServiceA2", id: 2 });
			expect(multipleInstances[2]).toBeInstanceOf(ServiceA3);

			// Single instance should be the last one
			expect(singleInstance).toBeInstanceOf(ServiceA3);
			expect(singleInstance).toBe(multipleInstances[2]);
		});

		it("should handle empty multiple resolve when no registrations", () => {
			// Act & Assert
			expect(() => {
				container.resolve(IServiceA, { multiple: true });
			}).toThrow(/Service identifier "IServiceA" is not registered/);
		});

		it("should handle single registration with multiple resolve", () => {
			// Arrange
			container.register(IServiceA, {
				useClass: ServiceA1,
				lifecycle: LifecycleEnum.resolution,
			});

			// Act
			const multipleInstances = container.resolve(IServiceA, {
				multiple: true,
			});
			const singleInstance = container.resolve(IServiceA);

			// Assert
			expect(multipleInstances).toBeDefined();
			expect(Array.isArray(multipleInstances)).toBe(true);
			expect(multipleInstances.length).toBe(1);
			expect(multipleInstances[0]).toBeInstanceOf(ServiceA1);

			expect(singleInstance).toBeInstanceOf(ServiceA1);
			expect(singleInstance).toBe(multipleInstances[0]);
		});
	});
});
