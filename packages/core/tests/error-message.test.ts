import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResolveException } from "../src/exceptions/resolve.exception";
import {
	createContainer,
	createServiceIdentifier,
	type IContainer,
	resolve,
} from "../src/index";
import { clearContainer } from "./test.utils";

/**
 * Test service identifiers
 */
const IServiceA = createServiceIdentifier<ServiceA>("IServiceA");
const IServiceB = createServiceIdentifier<ServiceB>("IServiceB");
const IServiceC = createServiceIdentifier<ServiceC>("IServiceC");
const IServiceD = createServiceIdentifier<ServiceD>("IServiceD");
const INonExistentService = createServiceIdentifier<unknown>(
	"INonExistentService",
);

/**
 * Test service classes for error testing
 */
class ServiceA {
	readonly serviceB = resolve(IServiceB);
}

class ServiceB {
	readonly serviceA = resolve(IServiceA);
}

class ServiceC {
	readonly serviceD = resolve(IServiceD);
}

class ServiceD {
	readonly serviceC = resolve(IServiceC);
}

describe("Error Messages", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("TestContainer");
	});

	afterEach(() => {
		if (container) {
			clearContainer(container);
		}
	});

	describe("Unregistered Service Errors", () => {
		it("should throw error with correct message for unregistered string identifier", () => {
			// Act & Assert
			expect(() => {
				container.resolve("NonExistentService");
			}).toThrow(
				'Service identifier "NonExistentService" is not registered in this container. Please register it first using container.register() or set the "optional" option to true if this service is optional.',
			);
		});

		it("should throw error with correct message for unregistered service identifier", () => {
			// Act & Assert
			expect(() => {
				container.resolve(INonExistentService);
			}).toThrow(
				'Service identifier "INonExistentService" is not registered in this container. Please register it first using container.register() or set the "optional" option to true if this service is optional.',
			);
		});

		it("should not throw error for optional unregistered service", () => {
			// Act
			const result = container.resolve("NonExistentService", {
				optional: true,
			});

			// Assert
			expect(result).toBeUndefined();
		});

		it("should return default value for optional unregistered service", () => {
			// Arrange
			const defaultValue = "default";

			// Act
			const result = container.resolve("NonExistentService", {
				optional: true,
				defaultValue,
			});

			// Assert
			expect(result).toBe(defaultValue);
		});
	});

	describe("Invalid Resolve Options Errors", () => {
		it("should throw error when both dynamic and ref options are used", () => {
			// Arrange
			container.register("TestService", {
				useValue: "test",
			});

			// Act & Assert
			expect(() => {
				container.resolve("TestService", {
					dynamic: true,
					ref: true,
				});
			}).toThrow(/Cannot use both "dynamic" and "ref" options simultaneously/);
		});

		it("should throw ResolveException for invalid resolve options", () => {
			// Arrange@
			container.register("TestService", {
				useValue: "test",
			});

			// Act & Assert
			expect(() => {
				container.resolve("TestService", {
					dynamic: true,
					ref: true,
				});
			}).toThrow(ResolveException);
		});
	});

	describe("Parent Container Resolution", () => {
		it("should resolve from parent container when service is not registered in child", () => {
			// Arrange
			const parentContainer = createContainer("ParentContainer");
			const childContainer = createContainer("ChildContainer", parentContainer);

			parentContainer.register("TestService", {
				useValue: "test",
			});

			// Act
			const result = childContainer.resolve("TestService");

			// Assert
			expect(result).toBe("test");
		});
	});

	describe("Class Auto-Registration", () => {
		it("should auto-register and resolve unregistered class", () => {
			// Arrange
			class TestClass {
				readonly name = "TestClass";
			}

			// Act
			const result = container.resolve(TestClass);

			// Assert
			expect(result).toBeInstanceOf(TestClass);
			expect(result.name).toBe("TestClass");
		});
	});

	describe("ResolveException Type Checking", () => {
		it("should correctly identify ResolveException instances", () => {
			// Arrange
			container.register("TestService", {
				useValue: "test",
			});

			// Act & Assert
			try {
				container.resolve("TestService", {
					dynamic: true,
					ref: true,
				});
			} catch (error) {
				expect(ResolveException.isResolveException(error)).toBe(true);
			}
		});

		it("should not identify regular Error as ResolveException", () => {
			// Act & Assert
			const regularError = new Error("Regular error");
			expect(ResolveException.isResolveException(regularError)).toBe(false);
		});

		it("should not identify null as ResolveException", () => {
			// Act & Assert
			expect(ResolveException.isResolveException(null)).toBe(false);
		});

		it("should not identify undefined as ResolveException", () => {
			// Act & Assert
			expect(ResolveException.isResolveException(undefined)).toBe(false);
		});
	});

	describe("Error Message Format", () => {
		it("should include service identifier name in error message", () => {
			// Act & Assert
			expect(() => {
				container.resolve("CustomServiceName");
			}).toThrow(/Service identifier "CustomServiceName"/);
		});

		it("should handle empty string service identifier", () => {
			// Act & Assert
			expect(() => {
				container.resolve("");
			}).toThrow(/Service identifier "" is not registered in this container/);
		});

		it("should handle special characters in service identifier", () => {
			// Act & Assert
			expect(() => {
				container.resolve("Service@#$%");
			}).toThrow(
				'Service identifier "Service@#$%" is not registered in this container. Please register it first using container.register() or set the "optional" option to true if this service is optional.',
			);
		});

		it("should handle numeric service identifier", () => {
			// Act & Assert
			expect(() => {
				container.resolve("123");
			}).toThrow(
				/Service identifier "123" is not registered in this container/,
			);
		});
	});

	describe("Circular Dependency Detection", () => {
		it("should throw ResolveException for circular dependency between two services", () => {
			// Arrange
			container.register(IServiceA, {
				useClass: ServiceA,
			});
			container.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act & Assert - Circular dependencies should throw ResolveException
			expect(() => {
				container.resolve(IServiceA);
			}).toThrow(ResolveException);
		});

		it("should include cycle information in error message", () => {
			// Arrange
			container.register(IServiceA, {
				useClass: ServiceA,
			});
			container.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act & Assert
			expect(() => {
				container.resolve(IServiceA);
			}).toThrow(
				/Circular dependency detected for service identifier "IServiceA"/,
			);
		});

		it("should throw ResolveException for circular dependency between four services", () => {
			// Arrange
			container.register(IServiceC, {
				useClass: ServiceC,
			});
			container.register(IServiceD, {
				useClass: ServiceD,
			});

			// Act & Assert - Circular dependencies should throw ResolveException
			expect(() => {
				container.resolve(IServiceC);
			}).toThrow(ResolveException);
		});

		it("should include cycle information in complex circular dependency error message", () => {
			// Arrange
			container.register(IServiceC, {
				useClass: ServiceC,
			});
			container.register(IServiceD, {
				useClass: ServiceD,
			});

			// Act & Assert
			expect(() => {
				container.resolve(IServiceC);
			}).toThrow(
				/Circular dependency detected for service identifier "IServiceC"/,
			);
		});
	});
});
