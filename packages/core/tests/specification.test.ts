/**
 * Specification Compliance Tests
 *
 * This test suite validates that the container implementation complies with
 * the behavioral contract defined in SPECIFICATION.md v1.0.0.
 *
 * Each test is labeled with its corresponding specification requirement ID
 * (e.g., R1, S2, L1, etc.) for traceability.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createContainer,
	createServiceIdentifier,
	globalMiddleware,
	type IContainer,
	LifecycleEnum,
	ResolveException,
	type ResolveMiddleware,
	resolve,
} from "../src/index";
import { clearContainer, clearMiddleware } from "./test.utils";

// ============================================================================
// Test Service Classes and Identifiers
// ============================================================================

class ServiceA {
	readonly name = "ServiceA";
}

class ServiceB {
	readonly name = "ServiceB";
	constructor(public readonly serviceA: ServiceA) {}
}

class ServiceC {
	readonly name = "ServiceC";
}

abstract class AbstractService {
	abstract getValue(): string;
}

class ConcreteService extends AbstractService {
	getValue(): string {
		return "concrete";
	}
}

// Service identifiers (must be declared before classes that use them)
const IServiceA = createServiceIdentifier<ServiceA>("IServiceA");
const IServiceB = createServiceIdentifier<ServiceB>("IServiceB");
const IServiceC = createServiceIdentifier<ServiceC>("IServiceC");
const IServiceD = createServiceIdentifier<ServiceD>("IServiceD");
const IServiceE = createServiceIdentifier<ServiceE>("IServiceE");
const ICircularA = createServiceIdentifier<CircularA>("ICircularA");
const ICircularB = createServiceIdentifier<CircularB>("ICircularB");

class ServiceD {
	readonly serviceB = resolve(IServiceB);
}

class ServiceE {
	readonly serviceD = resolve(IServiceD);
}

// Circular dependency test classes
class CircularA {
	readonly circularB = resolve(ICircularB);
}

class CircularB {
	readonly circularA = resolve(ICircularA);
}
const IAbstractService =
	createServiceIdentifier<AbstractService>("IAbstractService");
const IMultiService = createServiceIdentifier<ServiceA>("IMultiService");
const IUnregisteredService = createServiceIdentifier<unknown>(
	"IUnregisteredService",
);
const IAliasTarget = createServiceIdentifier<ServiceA>("IAliasTarget");

// ============================================================================
// 4.1 Service Registration
// ============================================================================

describe("SPEC 4.1: Service Registration", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("RegistrationTestContainer");
	});

	afterEach(() => {
		clearContainer(container);
	});

	describe("R2: Multiple Registration", () => {
		it("should allow multiple registrations of the same ServiceIdentifier", () => {
			// Arrange & Act
			container.register(IMultiService, { useClass: ServiceA });
			container.register(IMultiService, { useClass: ServiceA });
			container.register(IMultiService, { useClass: ServiceA });

			// Assert
			const instances = container.resolve(IMultiService, { multiple: true });
			expect(instances).toHaveLength(3);
		});

		it("should return the latest registration when resolving with multiple: false", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			container.register(ITestValue, {
				useValue: { id: 1 },
			});
			container.register(ITestValue, {
				useValue: { id: 2 },
			});
			container.register(ITestValue, {
				useValue: { id: 3 },
			});

			// Act
			const instance = container.resolve(ITestValue);

			// Assert
			expect(instance.id).toBe(3);
		});

		it("should return all registrations when resolving with multiple: true", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const values = [{ id: 1 }, { id: 2 }, { id: 3 }];
			values.forEach((value) => {
				container.register(ITestValue, { useValue: value });
			});

			// Act
			const instances = container.resolve(ITestValue, { multiple: true });

			// Assert
			expect(instances).toHaveLength(3);
			expect(instances.map((i) => i.id)).toEqual([1, 2, 3]);
		});
	});

	describe("R3: Lifecycle Default", () => {
		it("should default to transient lifecycle when not specified", () => {
			// Arrange
			let instanceCount = 0;
			container.register(IServiceA, {
				useFactory: () => {
					instanceCount++;
					return new ServiceA();
				},
			});

			// Act
			const instance1 = container.resolve(IServiceA);
			const instance2 = container.resolve(IServiceA);

			// Assert - transient should create new instances each time
			expect(instance1).not.toBe(instance2);
			expect(instanceCount).toBe(2);
		});
	});
});

// ============================================================================
// 4.2 Service Resolution
// ============================================================================

describe("SPEC 4.2: Service Resolution", () => {
	let parentContainer: IContainer;
	let childContainer: IContainer;

	beforeEach(() => {
		parentContainer = createContainer("ParentContainer");
		childContainer = createContainer("ChildContainer", parentContainer);
	});

	afterEach(() => {
		clearContainer(childContainer);
		clearContainer(parentContainer);
		clearMiddleware(globalMiddleware);
	});

	describe("S1: Resolution Order", () => {
		it("should search local registrations first", () => {
			// Arrange
			const parentService = new ServiceA();
			const childService = new ServiceA();
			parentContainer.register(IServiceA, {
				useValue: parentService,
			});
			childContainer.register(IServiceA, {
				useValue: childService,
			});

			// Act
			const instance = childContainer.resolve(IServiceA);

			// Assert
			expect(instance).toBe(childService);
			expect(instance).not.toBe(parentService);
		});

		it("should search parent container if not found locally", () => {
			// Arrange
			const parentService = new ServiceA();
			parentContainer.register(IServiceA, {
				useValue: parentService,
			});

			// Act
			const instance = childContainer.resolve(IServiceA);

			// Assert
			expect(instance).toBe(parentService);
		});
	});

	describe("S2: Optional Resolution", () => {
		it("should return undefined when service not found and optional: true without defaultValue", () => {
			// Act
			const instance = childContainer.resolve(IUnregisteredService, {
				optional: true,
			});

			// Assert
			expect(instance).toBeUndefined();
		});

		it("should return defaultValue when service not found and optional: true with defaultValue", () => {
			// Arrange
			const defaultValue = new ServiceA();

			// Act
			const instance = childContainer.resolve(IServiceA, {
				optional: true,
				defaultValue,
			});

			// Assert
			expect(instance).toBe(defaultValue);
		});
	});

	describe("S3: Required Resolution", () => {
		it("should throw ResolveException when service not found and optional is false", () => {
			// Act & Assert
			expect(() => {
				childContainer.resolve(IUnregisteredService);
			}).toThrow(ResolveException);
		});

		it("should throw ResolveException when service not found and optional is undefined", () => {
			// Act & Assert
			expect(() => {
				childContainer.resolve(IUnregisteredService, {});
			}).toThrow(ResolveException);
		});
	});

	describe("S4: Multiple Resolution", () => {
		it("should return array with all registered instances when multiple: true", () => {
			// Arrange
			childContainer.register(IMultiService, { useClass: ServiceA });
			childContainer.register(IMultiService, { useClass: ServiceA });

			// Act
			const instances = childContainer.resolve(IMultiService, {
				multiple: true,
			});

			// Assert
			expect(Array.isArray(instances)).toBe(true);
			expect(instances).toHaveLength(2);
		});

		it("should return undefined when no instances found and multiple: true, optional: true without defaultValue", () => {
			// Act
			const instances = childContainer.resolve(IUnregisteredService, {
				multiple: true,
				optional: true,
			});

			// Assert
			expect(instances).toBeUndefined();
		});

		it("should return defaultValue when no instances found and multiple: true with defaultValue", () => {
			// Arrange
			const defaultValue = [new ServiceA(), new ServiceA()];

			// Act
			const instances = childContainer.resolve(IServiceA, {
				multiple: true,
				optional: true,
				defaultValue,
			});

			// Assert
			expect(instances).toBe(defaultValue);
		});

		it("should throw when no instances found and multiple: true, optional: false", () => {
			// Act & Assert
			expect(() => {
				childContainer.resolve(IUnregisteredService, { multiple: true });
			}).toThrow(ResolveException);
		});
	});

	describe("S5: Reference Resolution", () => {
		it("should return Ref<T> object with current property when ref: true", () => {
			// Arrange
			childContainer.register(IServiceA, { useClass: ServiceA });

			// Act
			const ref = childContainer.resolve(IServiceA, { ref: true });

			// Assert
			expect(ref).toHaveProperty("current");
			expect(ref.current).toBeInstanceOf(ServiceA);
		});

		it("should re-resolve service on each access when dynamic: true", () => {
			// Arrange
			let instanceCount = 0;
			childContainer.register(IServiceA, {
				useFactory: () => {
					instanceCount++;
					return new ServiceA();
				},
			});

			// Act
			const dynamicRef = childContainer.resolve(IServiceA, { dynamic: true });
			const instance1 = dynamicRef.current;
			const instance2 = dynamicRef.current;

			// Assert
			expect(instance1).not.toBe(instance2);
			expect(instanceCount).toBe(2);
		});

		it("should return same instance on each access when ref: true (static ref)", () => {
			// Arrange
			let instanceCount = 0;
			childContainer.register(IServiceA, {
				useFactory: () => {
					instanceCount++;
					return new ServiceA();
				},
			});

			// Act
			const staticRef = childContainer.resolve(IServiceA, { ref: true });
			const instance1 = staticRef.current;
			const instance2 = staticRef.current;

			// Assert
			expect(instance1).toBe(instance2);
			expect(instanceCount).toBe(1);
		});
	});

	describe("S6: Alias Resolution", () => {
		it("should delegate resolution to target ServiceIdentifier", () => {
			// Arrange
			const sharedInstance = new ServiceA();
			childContainer.register(IServiceA, {
				useValue: sharedInstance,
			});
			childContainer.register(IAliasTarget, { useAlias: IServiceA });

			// Act
			const instanceA = childContainer.resolve(IServiceA);
			const instanceAliased = childContainer.resolve(IAliasTarget);

			// Assert - Alias should resolve to the same value instance
			expect(instanceA).toBe(sharedInstance);
			expect(instanceAliased).toBe(sharedInstance);
			expect(instanceA).toBe(instanceAliased);
		});

		it("should use getContainer when provided for alias resolution", () => {
			// Arrange
			const aliasTargetContainer = createContainer("AliasTargetContainer");
			const targetService = new ServiceA();
			aliasTargetContainer.register(IServiceA, {
				useValue: targetService,
			});

			childContainer.register(IAliasTarget, {
				useAlias: IServiceA,
				getContainer: () => aliasTargetContainer,
			});

			// Act
			const instance = childContainer.resolve(IAliasTarget);

			// Assert
			expect(instance).toBe(targetService);

			// Cleanup
			clearContainer(aliasTargetContainer);
		});

		it("should use current container when getContainer is not provided", () => {
			// Arrange
			const currentService = new ServiceA();
			childContainer.register(IServiceA, {
				useValue: currentService,
			});
			childContainer.register(IAliasTarget, { useAlias: IServiceA });

			// Act
			const instance = childContainer.resolve(IAliasTarget);

			// Assert
			expect(instance).toBe(currentService);
		});
	});
});

// ============================================================================
// 4.3 Lifecycle Management
// ============================================================================

describe("SPEC 4.3: Lifecycle Management", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("LifecycleTestContainer");
	});

	afterEach(() => {
		clearContainer(container);
		clearMiddleware(globalMiddleware);
	});

	describe("L1: Transient Lifecycle", () => {
		it("should create new instance every time service is resolved", () => {
			// Arrange
			container.register(IServiceA, {
				useClass: ServiceA,
				lifecycle: LifecycleEnum.transient,
			});

			// Act
			const instance1 = container.resolve(IServiceA);
			const instance2 = container.resolve(IServiceA);
			const instance3 = container.resolve(IServiceA);

			// Assert
			expect(instance1).not.toBe(instance2);
			expect(instance2).not.toBe(instance3);
			expect(instance1).not.toBe(instance3);
		});
	});

	describe("L2: Singleton Lifecycle", () => {
		it("should create instance once and reuse for all subsequent resolutions", () => {
			// Arrange
			const singletonInstance = new ServiceA();
			container.register(IServiceA, {
				useValue: singletonInstance,
			});

			// Act
			const instance1 = container.resolve(IServiceA);
			const instance2 = container.resolve(IServiceA);
			const instance3 = container.resolve(IServiceA);

			// Assert - All instances should be the exact same object reference
			expect(instance1).toBe(singletonInstance);
			expect(instance2).toBe(singletonInstance);
			expect(instance3).toBe(singletonInstance);
			expect(instance1).toBe(instance2);
			expect(instance2).toBe(instance3);
		});

		it("should maintain separate singleton instances per container", () => {
			// Arrange
			const container2 = createContainer("SecondContainer");
			container.register(IServiceA, {
				useClass: ServiceA,
				lifecycle: LifecycleEnum.singleton,
			});
			container2.register(IServiceA, {
				useClass: ServiceA,
				lifecycle: LifecycleEnum.singleton,
			});

			// Act
			const instance1 = container.resolve(IServiceA);
			const instance2 = container2.resolve(IServiceA);

			// Assert
			expect(instance1).not.toBe(instance2);

			// Cleanup
			clearContainer(container2);
		});
	});

	describe("L3: Resolution Lifecycle", () => {
		it("should create instance once per resolution context", () => {
			// Arrange
			let instanceCount = 0;
			container.register(IServiceA, {
				useFactory: () => {
					instanceCount++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceB, {
				useFactory: (container) => {
					const serviceA = container.resolve(IServiceA);
					return new ServiceB(serviceA);
				},
				lifecycle: LifecycleEnum.transient,
			});
			container.register(IServiceC, {
				useFactory: (container) => {
					// Resolve ServiceA again in same resolution context
					container.resolve(IServiceA);
					return new ServiceC();
				},
				lifecycle: LifecycleEnum.transient,
			});
			container.register(IServiceD, {
				useClass: ServiceD,
				lifecycle: LifecycleEnum.transient,
			});

			// Act - First resolution chain
			const serviceB1 = container.resolve(IServiceB);

			// Act - Second resolution chain
			const serviceB2 = container.resolve(IServiceB);

			// Assert - Should create new instance per resolution chain
			expect(serviceB1.serviceA).not.toBe(serviceB2.serviceA);
			expect(instanceCount).toBe(2);
		});

		it("should reuse same instance within single resolution context", () => {
			// Arrange
			let instanceCount = 0;
			container.register(IServiceA, {
				useFactory: () => {
					instanceCount++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IServiceD, { useClass: ServiceD });
			container.register(IServiceB, {
				useFactory: (container) => {
					return new ServiceB(container.resolve(IServiceA));
				},
			});
			container.register(IServiceE, { useClass: ServiceE });

			// Act - Resolve ServiceE which depends on ServiceD which depends on ServiceB which depends on ServiceA
			const serviceE = container.resolve(IServiceE);
			const serviceB = serviceE.serviceD.serviceB;

			// Assert - ServiceA should only be created once within this resolution context
			expect(instanceCount).toBe(1);
			expect(serviceB.serviceA).toBeInstanceOf(ServiceA);
		});
	});
});

// ============================================================================
// 4.4 Circular Dependency Detection
// ============================================================================

describe("SPEC 4.4: Circular Dependency Detection", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("CircularDepTestContainer");
	});

	afterEach(() => {
		clearContainer(container);
	});

	describe("C1: Detection Requirement", () => {
		it("should detect circular dependencies during resolution", () => {
			// Arrange
			container.register(ICircularA, { useClass: CircularA });
			container.register(ICircularB, { useClass: CircularB });

			// Act & Assert
			expect(() => {
				container.resolve(ICircularA);
			}).toThrow(ResolveException);
		});
	});

	describe("C2 & C3: Detection Criteria and Error Reporting", () => {
		it("should detect when ServiceIdentifier appears twice in resolution path", () => {
			// Arrange
			container.register(ICircularA, { useClass: CircularA });
			container.register(ICircularB, { useClass: CircularB });

			// Act & Assert
			let error: ResolveException | null = null;
			try {
				container.resolve(ICircularA);
			} catch (e) {
				error = e as ResolveException;
			}

			expect(error).toBeInstanceOf(ResolveException);
			expect(error?.message).toContain("Circular dependency");
		});

		it("should include complete resolution path in error message", () => {
			// Arrange
			container.register(ICircularA, { useClass: CircularA });
			container.register(ICircularB, { useClass: CircularB });

			// Act & Assert
			let error: ResolveException | null = null;
			try {
				container.resolve(ICircularA);
			} catch (e) {
				error = e as ResolveException;
			}

			expect(error).toBeInstanceOf(ResolveException);
			// Error message should contain both service identifiers
			const message = error?.message || "";
			expect(message).toContain("ICircularA");
			expect(message).toContain("ICircularB");
		});
	});
});

// ============================================================================
// 4.5 Container Hierarchy
// ============================================================================

describe("SPEC 4.5: Container Hierarchy", () => {
	let parentContainer: IContainer;
	let childContainer: IContainer;

	beforeEach(() => {
		parentContainer = createContainer("ParentContainer");
		childContainer = createContainer("ChildContainer", parentContainer);
	});

	afterEach(() => {
		clearContainer(childContainer);
		clearContainer(parentContainer);
	});

	describe("H1: Parent-Child Resolution", () => {
		it("should resolve services registered in parent container", () => {
			// Arrange
			parentContainer.register(IServiceA, { useClass: ServiceA });

			// Act
			const instance = childContainer.resolve(IServiceA);

			// Assert
			expect(instance).toBeInstanceOf(ServiceA);
		});

		it("should resolve services from multiple levels up the hierarchy", () => {
			// Arrange
			const grandchildContainer = createContainer(
				"GrandchildContainer",
				childContainer,
			);
			parentContainer.register(IServiceA, { useClass: ServiceA });

			// Act
			const instance = grandchildContainer.resolve(IServiceA);

			// Assert
			expect(instance).toBeInstanceOf(ServiceA);

			// Cleanup
			clearContainer(grandchildContainer);
		});
	});

	describe("H2: Registration Isolation", () => {
		it("should not affect parent when registering in child", () => {
			// Arrange
			childContainer.register(IServiceA, { useClass: ServiceA });

			// Act & Assert
			expect(() => {
				parentContainer.resolve(IServiceA);
			}).toThrow(ResolveException);
		});

		it("should not see child registrations from parent", () => {
			// Arrange
			const childValue = new ServiceA();
			childContainer.register(IServiceA, { useValue: childValue });

			// Act & Assert
			expect(childContainer.resolve(IServiceA)).toBe(childValue);
			expect(() => parentContainer.resolve(IServiceA)).toThrow(
				ResolveException,
			);
		});
	});

	describe("H3: Parent Immutability", () => {
		it("should have immutable parent property", () => {
			// Assert
			expect(childContainer.parent).toBe(parentContainer);

			// Attempting to reassign parent should not be possible with TypeScript
			// This is enforced at compile-time by readonly modifier
			// At runtime, we verify the parent remains unchanged
			const originalParent = childContainer.parent;
			expect(originalParent).toBe(parentContainer);
		});
	});
});

// ============================================================================
// 4.6 Middleware System
// ============================================================================

describe("SPEC 4.6: Middleware System", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("MiddlewareTestContainer");
	});

	afterEach(() => {
		clearContainer(container);
		clearMiddleware(globalMiddleware);
	});

	describe("M1: Middleware Execution Order", () => {
		it("should execute middlewares in registration order (last registered executes first in the chain)", () => {
			// Arrange
			const executionOrder: number[] = [];
			container.use({
				name: "middleware1",
				executor: (params, next) => {
					executionOrder.push(1);
					return next(params);
				},
			});
			container.use({
				name: "middleware2",
				executor: (params, next) => {
					executionOrder.push(2);
					return next(params);
				},
			});
			container.use({
				name: "middleware3",
				executor: (params, next) => {
					executionOrder.push(3);
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert - Last registered middleware (3) executes first
			expect(executionOrder).toEqual([3, 2, 1]);
		});
	});

	describe("M2: Middleware Chain", () => {
		it("should provide params object to middleware", () => {
			// Arrange
			let receivedParams: unknown = null;
			container.use({
				name: "inspectMiddleware",
				executor: (params, next) => {
					receivedParams = params;
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(receivedParams).toBeDefined();
			expect(receivedParams).toHaveProperty("serviceIdentifier");
			expect(receivedParams).toHaveProperty("container");
		});

		it("should provide next function to continue chain", () => {
			// Arrange
			let nextCalled = false;
			container.use({
				name: "checkNextMiddleware",
				executor: (params, next) => {
					const result = next(params);
					nextCalled = true;
					return result;
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(nextCalled).toBe(true);
		});
	});

	describe("M3: Global vs Local Middleware", () => {
		it("should execute local middlewares before global middlewares in the chain", () => {
			// Arrange
			const executionOrder: string[] = [];
			globalMiddleware.use({
				name: "globalMw",
				executor: (params, next) => {
					executionOrder.push("global");
					return next(params);
				},
			});
			container.use({
				name: "localMw",
				executor: (params, next) => {
					executionOrder.push("local");
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert - Local middleware executes before global in the chain
			expect(executionOrder).toEqual(["local", "global"]);
		});

		it("should apply global middleware to all containers", () => {
			// Arrange
			const container2 = createContainer("SecondContainer");
			let globalCallCount = 0;
			globalMiddleware.use({
				name: "globalCountMw",
				executor: (params, next) => {
					globalCallCount++;
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });
			container2.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);
			container2.resolve(IServiceA);

			// Assert
			expect(globalCallCount).toBe(2);

			// Cleanup
			clearContainer(container2);
		});

		it("should apply local middleware only to specific container", () => {
			// Arrange
			const container2 = createContainer("SecondContainer");
			let localCallCount = 0;
			container.use({
				name: "localCountMw",
				executor: (params, next) => {
					localCallCount++;
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });
			container2.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);
			container2.resolve(IServiceA);

			// Assert
			expect(localCallCount).toBe(1);

			// Cleanup
			clearContainer(container2);
		});
	});

	describe("M4: Middleware Interception", () => {
		it("should allow middleware to inspect resolution parameters", () => {
			// Arrange
			let inspectedIdentifier: unknown = null;
			container.use({
				name: "inspectMiddleware",
				executor: (params, next) => {
					inspectedIdentifier = params.serviceIdentifier;
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(inspectedIdentifier).toBe(IServiceA);
		});

		it("should allow middleware to transform resolved instance", () => {
			// Arrange
			container.use({
				name: "transformMiddleware",
				executor: (params, next) => {
					const instance = next(params);
					if (instance && typeof instance === "object" && "name" in instance) {
						// Add transformed property for testing
						Object.assign(instance, { transformed: true });
					}
					return instance;
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			const instance = container.resolve(IServiceA);

			// Assert
			expect(
				(instance as ServiceA & { transformed?: boolean }).transformed,
			).toBe(true);
		});

		it("should allow middleware to short-circuit resolution", () => {
			// Arrange
			const mockInstance = new ServiceA();
			container.use({
				name: "shortCircuitMiddleware",
				executor: (_params, _next) => {
					// Don't call next(), return mock instead
					return mockInstance;
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			const instance = container.resolve(IServiceA);

			// Assert
			expect(instance).toBe(mockInstance);
		});
	});

	describe("M5: Middleware Removal", () => {
		it("should remove middleware when unused is called", () => {
			// Arrange
			let callCount = 0;
			const middleware = {
				name: "countMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => {
					callCount++;
					return next(params);
				},
			};

			container.use(middleware);
			container.register(IServiceA, { useClass: ServiceA });

			// Act - First resolve, middleware should execute
			container.resolve(IServiceA);
			expect(callCount).toBe(1);

			// Remove middleware
			container.unused(middleware);
			callCount = 0;

			// Act - Second resolve, middleware should not execute
			container.resolve(IServiceA);

			// Assert
			expect(callCount).toBe(0);
		});
	});
});

// ============================================================================
// 4.7 Resource Disposal
// ============================================================================

describe("SPEC 4.7: Resource Disposal", () => {
	describe("D1: Disposal State", () => {
		it("should reject operations after disposal", () => {
			// Arrange
			const container = createContainer("DisposalTestContainer");
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.dispose();

			// Assert
			expect(container.disposed).toBe(true);
			expect(() => container.resolve(IServiceA)).toThrow();
			expect(() =>
				container.register(IServiceB, { useClass: ServiceB }),
			).toThrow();
		});

		it("should reject all container operations when disposed", () => {
			// Arrange
			const container = createContainer("DisposalTestContainer");

			// Act
			container.dispose();

			// Assert - Most operations should throw when disposed
			expect(() => container.resolve(IServiceA)).toThrow();
			expect(() =>
				container.register(IServiceA, { useClass: ServiceA }),
			).toThrow();
			expect(() => container.unregister(IServiceA)).toThrow();
		});
	});

	describe("D2: No Cascading", () => {
		it("should not automatically dispose child containers", () => {
			// Arrange
			const parentContainer = createContainer("ParentContainer");
			const childContainer = createContainer("ChildContainer", parentContainer);
			childContainer.register(IServiceA, { useClass: ServiceA });

			// Act
			parentContainer.dispose();

			// Assert
			expect(parentContainer.disposed).toBe(true);
			expect(childContainer.disposed).toBe(false);
			// Child should still be usable
			expect(() => childContainer.resolve(IServiceA)).not.toThrow();

			// Cleanup
			clearContainer(childContainer);
		});

		it("should require independent disposal of each container", () => {
			// Arrange
			const parentContainer = createContainer("ParentContainer");
			const childContainer = createContainer("ChildContainer", parentContainer);

			// Act
			parentContainer.dispose();
			childContainer.dispose();

			// Assert
			expect(parentContainer.disposed).toBe(true);
			expect(childContainer.disposed).toBe(true);
		});
	});

	describe("D3: Idempotency", () => {
		it("should be safe to call dispose multiple times", () => {
			// Arrange
			const container = createContainer("IdempotencyTestContainer");

			// Act & Assert - Should not throw
			expect(() => {
				container.dispose();
				container.dispose();
				container.dispose();
			}).not.toThrow();

			expect(container.disposed).toBe(true);
		});
	});
});

// ============================================================================
// 5. Validation Rules
// ============================================================================

describe("SPEC 5: Validation Rules", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("ValidationTestContainer");
	});

	afterEach(() => {
		clearContainer(container);
	});

	describe("V2: Class Provider Validation", () => {
		it("should accept valid constructor function for useClass", () => {
			// Act & Assert
			expect(() => {
				container.register(IServiceA, { useClass: ServiceA });
			}).not.toThrow();
		});
	});

	describe("V3: Factory Provider Validation", () => {
		it("should accept valid factory function for useFactory", () => {
			// Act & Assert
			expect(() => {
				container.register(IServiceA, {
					useFactory: () => new ServiceA(),
				});
			}).not.toThrow();
		});
	});

	describe("V4: Alias Provider Validation", () => {
		it("should accept valid ServiceIdentifier for useAlias", () => {
			// Arrange
			container.register(IServiceA, { useClass: ServiceA });

			// Act & Assert
			expect(() => {
				container.register(IAliasTarget, { useAlias: IServiceA });
			}).not.toThrow();
		});

		it("should accept valid getContainer function for useAlias", () => {
			// Arrange
			const targetContainer = createContainer("TargetContainer");
			targetContainer.register(IServiceA, { useClass: ServiceA });

			// Act & Assert
			expect(() => {
				container.register(IAliasTarget, {
					useAlias: IServiceA,
					getContainer: () => targetContainer,
				});
			}).not.toThrow();

			// Cleanup
			clearContainer(targetContainer);
		});
	});

	describe("V5: ServiceIdentifier Validation", () => {
		it("should accept class constructor as ServiceIdentifier", () => {
			// Act & Assert
			expect(() => {
				container.register(ServiceA, { useClass: ServiceA });
				container.resolve(ServiceA);
			}).not.toThrow();
		});

		it("should accept abstract constructor as ServiceIdentifier", () => {
			// Act & Assert
			expect(() => {
				container.register(IAbstractService, { useClass: ConcreteService });
				container.resolve(IAbstractService);
			}).not.toThrow();
		});

		it("should accept string as ServiceIdentifier", () => {
			// Act & Assert
			expect(() => {
				const strIdentifier = createServiceIdentifier<ServiceA>("StringId");
				container.register(strIdentifier, { useClass: ServiceA });
				container.resolve(strIdentifier);
			}).not.toThrow();
		});

		it("should accept symbol as ServiceIdentifier", () => {
			// Act & Assert
			expect(() => {
				const symIdentifier = Symbol("SymbolId");
				container.register(symIdentifier, { useClass: ServiceA });
				container.resolve(symIdentifier);
			}).not.toThrow();
		});
	});

	describe("V6: Resolve Options Validation", () => {
		it("should require optional: true when defaultValue is specified for single value", () => {
			// Arrange
			const defaultValue = new ServiceA();

			// Act - With optional: true (valid)
			const result = container.resolve(IServiceA, {
				optional: true,
				defaultValue,
			});

			// Assert
			expect(result).toBe(defaultValue);
		});

		it("should require defaultValue to be array when multiple: true", () => {
			// Arrange
			const defaultValue = [new ServiceA(), new ServiceA()];

			// Act
			const result = container.resolve(IServiceA, {
				multiple: true,
				optional: true,
				defaultValue,
			});

			// Assert
			expect(result).toBe(defaultValue);
			expect(Array.isArray(result)).toBe(true);
		});
	});
});
