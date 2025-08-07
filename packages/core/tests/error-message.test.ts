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
const IServiceE = createServiceIdentifier<ServiceE>("IServiceE");
const IServiceF = createServiceIdentifier<ServiceF>("IServiceF");
const IServiceG = createServiceIdentifier<ServiceG>("IServiceG");
const IServiceH = createServiceIdentifier<ServiceH>("IServiceH");
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

/**
 * Test service classes for ref + circular dependency testing
 */
class ServiceE {
	readonly serviceF = resolve(IServiceF, { ref: true });
}

class ServiceF {
	readonly serviceE = resolve(IServiceE);
}

class ServiceG {
	readonly serviceH = resolve(IServiceH, { dynamic: true });
}

class ServiceH {
	readonly serviceG = resolve(IServiceG);
}

/**
 * Test service classes with ref resolution that should work
 */
class ServiceWithRefA {
	readonly serviceBRef = resolve(IServiceB, { ref: true });
}

class ServiceWithRefB {
	readonly serviceARef = resolve(IServiceA, { ref: true });
}

/**
 * Test service classes with dynamic resolution that should work
 */
class ServiceWithDynamicA {
	readonly serviceBDynamic = resolve(IServiceB, { dynamic: true });
}

class ServiceWithDynamicB {
	readonly serviceADynamic = resolve(IServiceA, { dynamic: true });
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

		it("should throw error when access a ref when ref exception factory is used", () => {
			const exceptionFactory = () => {
				throw new Error("test");
			};

			container.register("TestService", {
				useFactory: exceptionFactory,
			});

			const refTestService = container.resolve("TestService", {
				ref: true,
			});

			// Act & Assert
			expect(() => {
				console.log("xxxx->", refTestService.current);
			}).toThrow(
				/Failed to resolve service identifier "TestService" in "TestContainer#CONTAINER-\d+": test/,
			);
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
			}).toThrow(
				'Circular dependency detected for service identifier "IServiceA". To resolve this, use either the "ref" option to get a reference to the service or the "dynamic" option to defer resolution until the service is actually used.',
			);
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

	describe("Ref + Circular Dependency Resolution", () => {
		it("should successfully resolve circular dependency when using ref option", () => {
			// Arrange
			container.register(IServiceE, {
				useClass: ServiceE,
			});
			container.register(IServiceF, {
				useClass: ServiceF,
			});

			// Act - 应该能够成功解析，因为 ServiceE 使用了 ref
			const serviceE = container.resolve(IServiceE);
			const serviceF = container.resolve(IServiceF);

			// Assert
			expect(serviceE).toBeInstanceOf(ServiceE);
			expect(serviceF).toBeInstanceOf(ServiceF);
			expect(serviceE.serviceF).toBeDefined();
			expect(serviceE.serviceF.current).toBeInstanceOf(ServiceF);
		});

		it("should successfully resolve circular dependency when using dynamic option", () => {
			// Arrange
			container.register(IServiceG, {
				useClass: ServiceG,
			});
			container.register(IServiceH, {
				useClass: ServiceH,
			});

			// Act - 应该能够成功解析，因为 ServiceG 使用了 dynamic
			const serviceG = container.resolve(IServiceG);
			const serviceH = container.resolve(IServiceH);

			// Assert
			expect(serviceG).toBeInstanceOf(ServiceG);
			expect(serviceH).toBeInstanceOf(ServiceH);
			expect(serviceG.serviceH).toBeDefined();
			expect(serviceG.serviceH.current).toBeInstanceOf(ServiceH);
		});

		it("should resolve both services with ref options to avoid circular dependency", () => {
			// Arrange - 两个服务都使用 ref，应该能够成功解析
			container.register("ServiceWithRefA", {
				useClass: ServiceWithRefA,
			});
			container.register("ServiceWithRefB", {
				useClass: ServiceWithRefB,
			});
			container.register(IServiceA, {
				useClass: ServiceA,
			});
			container.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act - 解析使用 ref 的服务应该成功
			const serviceWithRefA = container.resolve("ServiceWithRefA");
			const serviceWithRefB = container.resolve("ServiceWithRefB");

			// Assert
			expect(serviceWithRefA).toBeInstanceOf(ServiceWithRefA);
			expect(serviceWithRefB).toBeInstanceOf(ServiceWithRefB);
		});

		it("should resolve both services with dynamic options to avoid circular dependency", () => {
			// Arrange - 两个服务都使用 dynamic，应该能够成功解析
			container.register("ServiceWithDynamicA", {
				useClass: ServiceWithDynamicA,
			});
			container.register("ServiceWithDynamicB", {
				useClass: ServiceWithDynamicB,
			});
			container.register(IServiceA, {
				useClass: ServiceA,
			});
			container.register(IServiceB, {
				useClass: ServiceB,
			});

			// Act - 解析使用 dynamic 的服务应该成功
			const serviceWithDynamicA = container.resolve("ServiceWithDynamicA");
			const serviceWithDynamicB = container.resolve("ServiceWithDynamicB");

			// Assert
			expect(serviceWithDynamicA).toBeInstanceOf(ServiceWithDynamicA);
			expect(serviceWithDynamicB).toBeInstanceOf(ServiceWithDynamicB);
		});

		it("should throw error when ref instance throws during access", () => {
			// Arrange - 创建一个会在构造时抛出错误的服务
			class ThrowingService {
				constructor() {
					throw new Error("Service construction failed");
				}
			}

			class ServiceWithThrowingRef {
				readonly throwingServiceRef = resolve("ThrowingService", { ref: true });
			}

			container.register("ThrowingService", {
				useClass: ThrowingService,
			});
			container.register("ServiceWithThrowingRef", {
				useClass: ServiceWithThrowingRef,
			});

			// Act - 解析包含 ref 的服务应该成功
			const serviceWithRef = container.resolve(
				"ServiceWithThrowingRef",
			) as ServiceWithThrowingRef;
			expect(serviceWithRef).toBeInstanceOf(ServiceWithThrowingRef);

			// Assert - 但是访问 ref 的 current 属性时应该抛出错误
			expect(() => {
				serviceWithRef.throwingServiceRef.current;
			}).toThrow(
				/Failed to resolve service identifier "ThrowingService" in "TestContainer#CONTAINER-\d+": Service construction failed/,
			);
		});

		it("should throw error when dynamic instance throws during access", () => {
			// Arrange - 创建一个会在构造时抛出错误的服务
			class ThrowingService {
				constructor() {
					throw new Error("Dynamic service construction failed");
				}
			}

			class ServiceWithThrowingDynamic {
				readonly throwingServiceDynamic = resolve("ThrowingService", {
					dynamic: true,
				});
			}

			container.register("ThrowingService", {
				useClass: ThrowingService,
			});
			container.register("ServiceWithThrowingDynamic", {
				useClass: ServiceWithThrowingDynamic,
			});

			// Act - 解析包含 dynamic 的服务应该成功
			const serviceWithDynamic = container.resolve(
				"ServiceWithThrowingDynamic",
			) as ServiceWithThrowingDynamic;
			expect(serviceWithDynamic).toBeInstanceOf(ServiceWithThrowingDynamic);

			// Assert - 但是访问 dynamic 的 current 属性时应该抛出错误
			expect(() => {
				serviceWithDynamic.throwingServiceDynamic.current;
			}).toThrow(
				/Failed to resolve service identifier "ThrowingService" in "TestContainer#CONTAINER-\d+": Dynamic service construction failed/,
			);
		});

		it("should handle nested ref resolution with circular dependencies", () => {
			// Arrange - 创建嵌套的循环依赖场景
			class NestedServiceA {
				readonly nestedServiceB = resolve("NestedServiceB", { ref: true });
				readonly directServiceC = resolve("NestedServiceC");
			}

			class NestedServiceB {
				readonly nestedServiceA = resolve("NestedServiceA");
			}

			class NestedServiceC {
				readonly value = "NestedServiceC";
			}

			container.register("NestedServiceA", {
				useClass: NestedServiceA,
			});
			container.register("NestedServiceB", {
				useClass: NestedServiceB,
			});
			container.register("NestedServiceC", {
				useClass: NestedServiceC,
			});

			// Act - 应该能够成功解析，因为使用了 ref 打破循环
			const nestedServiceA = container.resolve(
				"NestedServiceA",
			) as NestedServiceA;

			// Assert
			expect(nestedServiceA).toBeInstanceOf(NestedServiceA);
			expect(nestedServiceA.directServiceC).toBeInstanceOf(NestedServiceC);
			expect(nestedServiceA.nestedServiceB.current).toBeInstanceOf(
				NestedServiceB,
			);
		});

		it("should provide helpful error message for mixed ref and direct circular dependencies", () => {
			// Arrange - 创建一个混合场景：一个服务使用 ref，另一个不使用
			class MixedServiceA {
				readonly mixedServiceB = resolve("MixedServiceB", { ref: true });
				readonly directDependency = resolve("MixedServiceC");
			}

			class MixedServiceB {
				readonly mixedServiceA = resolve("MixedServiceA"); // 直接依赖，会导致循环
			}

			class MixedServiceC {
				readonly mixedServiceA = resolve("MixedServiceA"); // 这会创建循环
			}

			container.register("MixedServiceA", {
				useClass: MixedServiceA,
			});
			container.register("MixedServiceB", {
				useClass: MixedServiceB,
			});
			container.register("MixedServiceC", {
				useClass: MixedServiceC,
			});

			// Act & Assert - 应该抛出循环依赖错误，并提供有用的错误信息
			expect(() => {
				container.resolve("MixedServiceA");
			}).toThrow(
				/Circular dependency detected for service identifier "MixedServiceA"/,
			);
		});

		it("should handle ref resolution with factory functions", () => {
			// Arrange - 使用工厂函数创建循环依赖
			container.register("FactoryServiceA", {
				useFactory: (container) => ({
					factoryServiceB: container.resolve("FactoryServiceB", { ref: true }),
					name: "FactoryServiceA",
				}),
			});

			container.register("FactoryServiceB", {
				useFactory: (container) => ({
					factoryServiceA: container.resolve("FactoryServiceA"),
					name: "FactoryServiceB",
				}),
			});

			// Act - 应该能够成功解析
			// biome-ignore lint/suspicious/noExplicitAny: 工厂函数返回的动态对象类型
			const factoryServiceA = container.resolve("FactoryServiceA") as any;

			// Assert
			expect(factoryServiceA.name).toBe("FactoryServiceA");
			expect(factoryServiceA.factoryServiceB).toBeDefined();
			expect(factoryServiceA.factoryServiceB.current.name).toBe(
				"FactoryServiceB",
			);
		});

		it("should handle dynamic resolution with factory functions", () => {
			// Arrange - 使用工厂函数创建循环依赖
			container.register("DynamicFactoryServiceA", {
				useFactory: (container) => ({
					dynamicFactoryServiceB: container.resolve("DynamicFactoryServiceB", {
						dynamic: true,
					}),
					name: "DynamicFactoryServiceA",
				}),
			});

			container.register("DynamicFactoryServiceB", {
				useFactory: (container) => ({
					dynamicFactoryServiceA: container.resolve("DynamicFactoryServiceA"),
					name: "DynamicFactoryServiceB",
				}),
			});

			// Act - 应该能够成功解析
			// biome-ignore lint/suspicious/noExplicitAny: 工厂函数返回的动态对象类型
			const dynamicFactoryServiceA = container.resolve(
				"DynamicFactoryServiceA",
			) as any;

			// Assert
			expect(dynamicFactoryServiceA.name).toBe("DynamicFactoryServiceA");
			expect(dynamicFactoryServiceA.dynamicFactoryServiceB).toBeDefined();
			expect(dynamicFactoryServiceA.dynamicFactoryServiceB.current.name).toBe(
				"DynamicFactoryServiceB",
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
				// biome-ignore lint/suspicious/noExplicitAny: 测试用例需要故意使用错误的类型
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
				// biome-ignore lint/suspicious/noExplicitAny: 测试用例需要故意使用错误的类型
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
