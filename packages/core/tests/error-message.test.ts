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
				'Service identifier "NonExistentService" is not registered in this container. Please register it first or set the "optional" option to true if this service is optional.',
			);
		});

		it("should throw error with correct message for unregistered service identifier", () => {
			// Act & Assert
			expect(() => {
				container.resolve(INonExistentService);
			}).toThrow(
				'Service identifier "INonExistentService" is not registered in this container. Please register it first or set the "optional" option to true if this service is optional.',
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
				'Service identifier "Service@#$%" is not registered in this container. Please register it first or set the "optional" option to true if this service is optional.',
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

	describe("useFactory Exception Handling", () => {
		it("should throw error when factory function throws an exception", () => {
			// Arrange
			const errorMessage = "Factory function error";
			container.register("FactoryService", {
				useFactory: () => {
					throw new Error(errorMessage);
				},
			});

			// Act & Assert
			expect(() => {
				container.resolve("FactoryService");
			}).toThrow(errorMessage);
		});

		it("should return undefined when factory function returns undefined", () => {
			// Arrange
			container.register("UndefinedFactoryService", {
				useFactory: () => undefined,
			});

			// Act
			const result = container.resolve("UndefinedFactoryService");

			// Assert
			expect(result).toBeUndefined();
		});

		it("should return null when factory function returns null", () => {
			// Arrange
			container.register("NullFactoryService", {
				useFactory: () => null,
			});

			// Act
			const result = container.resolve("NullFactoryService");

			// Assert
			expect(result).toBeNull();
		});

		it("should throw error when factory function is not a function", () => {
			// Arrange
			container.register("InvalidFactoryService", {
				useFactory: "not a function" as any,
			});

			// Act & Assert
			expect(() => {
				container.resolve("InvalidFactoryService");
			}).toThrow();
		});

		it("should handle factory function that throws ResolveException", () => {
			// Arrange
			container.register("ResolveExceptionFactoryService", {
				useFactory: () => {
					throw new Error("Custom resolve exception");
				},
			});

			// Act & Assert
			expect(() => {
				container.resolve("ResolveExceptionFactoryService");
			}).toThrow("Custom resolve exception");
		});

		it("should handle factory function with dependency resolution error", () => {
			// Arrange
			container.register("DependencyFactoryService", {
				useFactory: (container) => {
					// 尝试解析未注册的服务
					return container.resolve("NonExistentDependency");
				},
			});

			// Act & Assert
			expect(() => {
				container.resolve("DependencyFactoryService");
			}).toThrow(/Service identifier "NonExistentDependency"/);
		});
	});

	describe("useClass Exception Handling", () => {
		it("should throw error when class constructor throws an exception", () => {
			// Arrange
			class ThrowingClass {
				constructor() {
					throw new Error("Constructor error");
				}
			}

			container.register("ThrowingClassService", {
				useClass: ThrowingClass,
			});

			// Act & Assert
			expect(() => {
				container.resolve("ThrowingClassService");
			}).toThrow("Constructor error");
		});

		it("should throw ResolveException when class is not a constructor", () => {
			// Arrange
			container.register("InvalidClassService", {
				useClass: "not a class" as any,
			});

			// Act & Assert
			expect(() => {
				container.resolve("InvalidClassService");
			}).toThrow();
		});

		it("should throw error when class has circular dependency in constructor", () => {
			// Arrange
			class CircularClass {
				constructor() {
					// 在构造函数中尝试解析自身
					container.resolve("CircularClassService");
				}
			}

			container.register("CircularClassService", {
				useClass: CircularClass,
			});

			// Act & Assert
			expect(() => {
				container.resolve("CircularClassService");
			}).toThrow();
		});

		it("should handle class with dependency that throws error", () => {
			// Arrange
			class DependentClass {
				constructor() {
					// 尝试解析未注册的依赖
					container.resolve("NonExistentService");
				}
			}

			container.register("DependentClassService", {
				useClass: DependentClass,
			});

			// Act & Assert
			expect(() => {
				container.resolve("DependentClassService");
			}).toThrow(
				'Service identifier "NonExistentService" is not registered in this container. Please register it first or set the "optional" option to true if this service is optional.',
			);
		});

		it("should handle class that throws ResolveException in constructor", () => {
			// Arrange
			class ResolveExceptionClass {
				constructor() {
					throw new Error("Class constructor resolve exception");
				}
			}

			container.register("ResolveExceptionClassService", {
				useClass: ResolveExceptionClass,
			});

			// Act & Assert
			expect(() => {
				container.resolve("ResolveExceptionClassService");
			}).toThrow("Class constructor resolve exception");
		});
	});
});
