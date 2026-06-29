/**
 * @overview Core container error message behavior tests.
 * @author AEPKILL
 * @created 2025-08-05 23:32:34
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreErrorCodeEnum } from "../src/enums/core-error-code.enum";
import { CoreException } from "../src/exceptions/core.exception";
import { ResolveException } from "../src/exceptions/resolve.exception";
import {
	createContainer,
	createServiceIdentifier,
	type IContainer,
	type Ref,
	type ResolveOptions,
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
		it("should expose E_SERVICE_NOT_FOUND as the structured code and message prefix", () => {
			try {
				container.resolve("NonExistentService");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect(ResolveException.isResolveException(error)).toBe(true);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_SERVICE_NOT_FOUND,
				);
				expect((error as Error).message).toContain(
					'E_SERVICE_NOT_FOUND: Service identifier "NonExistentService" is not registered in this container.',
				);
			}
		});

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
		it("should expose E_INVALID_OPTIONS as the structured code and message prefix", () => {
			container.register("TestService", {
				useValue: "test",
			});

			try {
				container.resolve("TestService", {
					dynamic: true,
					ref: true,
				} as unknown as ResolveOptions<string>);
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_INVALID_OPTIONS,
				);
				expect((error as Error).message).toContain(
					'E_INVALID_OPTIONS: Cannot use both "dynamic" and "ref" options simultaneously',
				);
			}
		});

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
				} as unknown as ResolveOptions<string>);
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
				} as unknown as ResolveOptions<string>);
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
				console.log("refTestService", refTestService.current);
			}).toThrow(
				/Failed to resolve service identifier "TestService" in "TestContainer\/CONTAINER-\d+": test/,
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
				} as unknown as ResolveOptions<string>);
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
		it("should expose E_CIRCULAR_DEPENDENCY as the structured code and message prefix", () => {
			container.register(IServiceA, {
				useClass: ServiceA,
			});
			container.register(IServiceB, {
				useClass: ServiceB,
			});

			try {
				container.resolve(IServiceA);
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_CIRCULAR_DEPENDENCY,
				);
				expect((error as Error).message).toContain(
					'E_CIRCULAR_DEPENDENCY: Circular dependency detected for service identifier "IServiceA".',
				);
			}
		});

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

			// Act - Resolution should succeed because ServiceE uses ref
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

			// Act - Resolution should succeed because ServiceG uses dynamic
			const serviceG = container.resolve(IServiceG);
			const serviceH = container.resolve(IServiceH);

			// Assert
			expect(serviceG).toBeInstanceOf(ServiceG);
			expect(serviceH).toBeInstanceOf(ServiceH);
			expect(serviceG.serviceH).toBeDefined();
			expect(serviceG.serviceH.current).toBeInstanceOf(ServiceH);
		});

		it("should resolve both services with ref options to avoid circular dependency", () => {
			// Arrange - Both services use ref, so resolution should succeed
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

			// Act - Resolving the ref-based services should succeed
			const serviceWithRefA = container.resolve("ServiceWithRefA");
			const serviceWithRefB = container.resolve("ServiceWithRefB");

			// Assert
			expect(serviceWithRefA).toBeInstanceOf(ServiceWithRefA);
			expect(serviceWithRefB).toBeInstanceOf(ServiceWithRefB);
		});

		it("should resolve both services with dynamic options to avoid circular dependency", () => {
			// Arrange - Both services use dynamic, so resolution should succeed
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

			// Act - Resolving the dynamic-based services should succeed
			const serviceWithDynamicA = container.resolve("ServiceWithDynamicA");
			const serviceWithDynamicB = container.resolve("ServiceWithDynamicB");

			// Assert
			expect(serviceWithDynamicA).toBeInstanceOf(ServiceWithDynamicA);
			expect(serviceWithDynamicB).toBeInstanceOf(ServiceWithDynamicB);
		});

		it("should throw error when ref instance throws during access", () => {
			// Arrange - Create a service that throws during construction
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

			// Act - Resolving the service that contains ref should succeed
			const serviceWithRef = container.resolve(
				"ServiceWithThrowingRef",
			) as ServiceWithThrowingRef;
			expect(serviceWithRef).toBeInstanceOf(ServiceWithThrowingRef);

			// Assert - Accessing ref.current should still throw
			expect(() => {
				serviceWithRef.throwingServiceRef.current;
			}).toThrow(
				/Failed to resolve service identifier "ThrowingService" in "TestContainer\/CONTAINER-\d+": Service construction failed/,
			);
		});

		it("should throw error when dynamic instance throws during access", () => {
			// Arrange - Create a service that throws during construction
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

			// Act - Resolving the service that contains dynamic should succeed
			const serviceWithDynamic = container.resolve(
				"ServiceWithThrowingDynamic",
			) as ServiceWithThrowingDynamic;
			expect(serviceWithDynamic).toBeInstanceOf(ServiceWithThrowingDynamic);

			// Assert - Accessing dynamic.current should still throw
			expect(() => {
				serviceWithDynamic.throwingServiceDynamic.current;
			}).toThrow(
				/Failed to resolve service identifier "ThrowingService" in "TestContainer\/CONTAINER-\d+": Dynamic service construction failed/,
			);
		});

		it("should handle nested ref resolution with circular dependencies", () => {
			// Arrange - Create a nested circular dependency scenario
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

			// Act - Resolution should succeed because ref breaks the cycle
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
			// Arrange - Create a mixed scenario where one service uses ref and the other does not
			class MixedServiceA {
				readonly mixedServiceB = resolve("MixedServiceB", { ref: true });
				readonly directDependency = resolve("MixedServiceC");
			}

			class MixedServiceB {
				readonly mixedServiceA = resolve("MixedServiceA"); // Direct dependency creates a cycle
			}

			class MixedServiceC {
				readonly mixedServiceA = resolve("MixedServiceA"); // This creates a cycle
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

			// Act & Assert - Should throw a circular dependency error with a helpful message
			expect(() => {
				container.resolve("MixedServiceA");
			}).toThrow(
				/Circular dependency detected for service identifier "MixedServiceA"/,
			);
		});

		it("should handle ref resolution with factory functions", () => {
			type FactoryServiceB = {
				readonly factoryServiceA: unknown;
				readonly name: "FactoryServiceB";
			};

			type FactoryServiceA = {
				readonly factoryServiceB: Ref<FactoryServiceB>;
				readonly name: "FactoryServiceA";
			};

			// Arrange - Create a circular dependency with factory functions
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

			// Act - Resolution should succeed
			const factoryServiceA =
				container.resolve<FactoryServiceA>("FactoryServiceA");

			// Assert
			expect(factoryServiceA.name).toBe("FactoryServiceA");
			expect(factoryServiceA.factoryServiceB).toBeDefined();
			expect(factoryServiceA.factoryServiceB.current.name).toBe(
				"FactoryServiceB",
			);
		});

		it("should handle dynamic resolution with factory functions", () => {
			type DynamicFactoryServiceB = {
				readonly dynamicFactoryServiceA: unknown;
				readonly name: "DynamicFactoryServiceB";
			};

			type DynamicFactoryServiceA = {
				readonly dynamicFactoryServiceB: Ref<DynamicFactoryServiceB>;
				readonly name: "DynamicFactoryServiceA";
			};

			// Arrange - Create a circular dependency with factory functions
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

			// Act - Resolution should succeed
			const dynamicFactoryServiceA = container.resolve<DynamicFactoryServiceA>(
				"DynamicFactoryServiceA",
			);

			// Assert
			expect(dynamicFactoryServiceA.name).toBe("DynamicFactoryServiceA");
			expect(dynamicFactoryServiceA.dynamicFactoryServiceB).toBeDefined();
			expect(dynamicFactoryServiceA.dynamicFactoryServiceB.current.name).toBe(
				"DynamicFactoryServiceB",
			);
		});
	});

	describe("useFactory Exception Handling", () => {
		it("should expose E_RESOLUTION_FAILED when a provider throws", () => {
			container.register("FactoryService", {
				useFactory: () => {
					throw new Error("Factory function error");
				},
			});

			try {
				container.resolve("FactoryService");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toContain(
					'E_RESOLUTION_FAILED: Failed to resolve service identifier "FactoryService"',
				);
			}
		});

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
			expect(() => {
				container.register("InvalidFactoryService", {
					// biome-ignore lint/suspicious/noExplicitAny: The test intentionally uses an invalid type
					useFactory: "not a function" as any,
				});
			}).toThrow(/E_INVALID_PROVIDER/);
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
					// Attempt to resolve an unregistered service
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
			expect(() => {
				container.register("InvalidClassService", {
					// biome-ignore lint/suspicious/noExplicitAny: The test intentionally uses an invalid type
					useClass: "not a class" as any,
				});
			}).toThrow(/E_INVALID_PROVIDER/);
		});

		it("should throw error when class has circular dependency in constructor", () => {
			// Arrange
			class CircularClass {
				constructor() {
					// Attempt to resolve itself from within the constructor
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
					// Attempt to resolve an unregistered dependency
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

	describe("Provider Failure Error Messages", () => {
		it("should include class construction context in resolve record for constructor error", () => {
			class FaultyClass {
				constructor() {
					throw new Error("Broken dependency");
				}
			}
			container.register("FaultyService", {
				useClass: FaultyClass,
			});

			try {
				container.resolve("FaultyService");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toMatch(
					/^E_RESOLUTION_FAILED: Failed to resolve service identifier "FaultyService" in "TestContainer\/CONTAINER-\d+": Broken dependency/,
				);
				expect((error as Error).message).toContain(
					'Constructing class for "FaultyService"',
				);
			}
		});

		it("should include factory invocation context in resolve record for factory error", () => {
			container.register("FactoryFault", {
				useFactory: () => {
					throw new Error("Factory exploded");
				},
			});

			try {
				container.resolve("FactoryFault");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toMatch(
					/^E_RESOLUTION_FAILED: Failed to resolve service identifier "FactoryFault" in "TestContainer\/CONTAINER-\d+": Factory exploded/,
				);
				expect((error as Error).message).toContain(
					'Invoking factory for "FactoryFault"',
				);
			}
		});

		it("should include alias container context in resolve record for getContainer error", () => {
			container.register("AliasTarget", {
				useValue: "target",
			});
			container.register("AliasFault", {
				useAlias: "AliasTarget",
				getContainer: () => {
					throw new Error("getContainer failed");
				},
			});

			try {
				container.resolve("AliasFault");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toMatch(
					/^E_RESOLUTION_FAILED: Failed to resolve service identifier "AliasFault" in "TestContainer\/CONTAINER-\d+": getContainer failed/,
				);
				expect((error as Error).message).toContain(
					'Resolving alias "AliasFault" as "AliasTarget" from configured container',
				);
			}
		});

		it("should include alias current-container context in resolve record for missing alias target", () => {
			container.register("AliasNormal", {
				useAlias: "AliasTarget3",
			});

			try {
				container.resolve("AliasNormal");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_SERVICE_NOT_FOUND,
				);
				expect((error as Error).message).toContain(
					'Resolving alias "AliasNormal" as "AliasTarget3" from current container',
				);
			}
		});

		it("should preserve original error code when constructor throws ResolveException", () => {
			class CircularA {
				constructor() {
					container.resolve("CircularB");
				}
			}
			class CircularB {
				constructor() {
					container.resolve("CircularA");
				}
			}

			container.register("CircularA", { useClass: CircularA });
			container.register("CircularB", { useClass: CircularB });

			try {
				container.resolve("CircularA");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_CIRCULAR_DEPENDENCY,
				);
				expect((error as Error).message).toContain(
					'Constructing class for "CircularA"',
				);
			}
		});

		it("should preserve original error code when factory throws ResolveException", () => {
			container.register("FaultServiceB", {
				useFactory: (container) => ({
					serviceA: container.resolve("FaultServiceA"),
				}),
			});

			container.register("FaultServiceA", {
				useFactory: (container) => ({
					serviceB: container.resolve("FaultServiceB"),
				}),
			});

			try {
				container.resolve("FaultServiceA");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_CIRCULAR_DEPENDENCY,
				);
				expect((error as Error).message).toContain(
					'Invoking factory for "FaultServiceA"',
				);
			}
		});

		it("should preserve original error code when constructor throws CoreException", () => {
			const disposedContainer = createContainer("DisposedContainer");
			disposedContainer.dispose();

			class UsesDisposedContainer {
				constructor() {
					disposedContainer.resolve("Anything");
				}
			}

			container.register("UsesDisposed", {
				useClass: UsesDisposedContainer,
			});

			try {
				container.resolve("UsesDisposed");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_CONTAINER_DISPOSED,
				);
				expect((error as Error).message).toContain("Container is disposed");
				expect((error as Error).message).toContain(
					'Constructing class for "UsesDisposed"',
				);
			}
		});

		it("should handle non-Error throw from constructor", () => {
			class StringThrower {
				constructor() {
					throw "raw string error";
				}
			}

			container.register("StringThrower", {
				useClass: StringThrower,
			});

			try {
				container.resolve("StringThrower");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toContain("raw string error");
				expect((error as Error).message).toContain(
					'Constructing class for "StringThrower"',
				);
			}
		});

		it("should handle non-Error throw from factory", () => {
			container.register("StringFactory", {
				useFactory: () => {
					throw "factory raw string";
				},
			});

			try {
				container.resolve("StringFactory");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toContain("factory raw string");
				expect((error as Error).message).toContain(
					'Invoking factory for "StringFactory"',
				);
			}
		});

		it("should handle non-Error throw from getContainer", () => {
			container.register("AliasTarget2", {
				useValue: "target2",
			});
			container.register("AliasStringThrow", {
				useAlias: "AliasTarget2",
				getContainer: () => {
					throw 42;
				},
			});

			try {
				container.resolve("AliasStringThrow");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toContain("42");
				expect((error as Error).message).toContain(
					'Resolving alias "AliasStringThrow" as "AliasTarget2" from configured container',
				);
			}
		});
	});

	describe("CoreException", () => {
		it("should expose E_CONTAINER_DISPOSED as the structured code and message prefix", () => {
			container.dispose();

			try {
				container.resolve("TestService");
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(CoreException);
				expect(CoreException.isCoreException(error)).toBe(true);
				expect((error as CoreException).code).toBe(
					CoreErrorCodeEnum.E_CONTAINER_DISPOSED,
				);
				expect((error as Error).message).toBe(
					"E_CONTAINER_DISPOSED: Container is disposed",
				);
			}
		});
	});
});
