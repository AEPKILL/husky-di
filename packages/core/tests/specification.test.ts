/**
 * @overview Core container specification compliance tests.
 *
 * This test suite validates that the container implementation complies with
 * the behavioral contract defined in SPECIFICATION.md v1.2.1.
 *
 * Each test is labeled with its corresponding specification requirement ID
 * (e.g., R1, S2, L1, etc.) for traceability.
 *
 * @author AEPKILL
 * @created 2025-11-28 17:39:24
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CoreErrorCodeEnum,
	createContainer,
	createRegistrationPlan,
	createServiceIdentifier,
	globalMiddleware,
	IContainer,
	LifecycleEnum,
	ResolveContainerScopeEnum,
	ResolveException,
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

	describe("R1: Provider Exclusivity", () => {
		it("should throw E_INVALID_PROVIDER when no provider strategy is specified", () => {
			expect(() => {
				container.register(IServiceA, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid registration shape
				} as any);
			}).toThrow(/E_INVALID_PROVIDER/);
		});

		it("should throw E_INVALID_PROVIDER when multiple provider strategies are specified", () => {
			expect(() => {
				container.register(IServiceA, {
					useClass: ServiceA,
					useValue: new ServiceA(),
				});
			}).toThrow(/E_INVALID_PROVIDER/);
		});
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

		it("should return a disposer that removes only its own registration", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const disposeRegistration1 = container.register(ITestValue, {
				useValue: { id: 1 },
			});
			container.register(ITestValue, {
				useValue: { id: 2 },
			});

			// Act
			disposeRegistration1();

			// Assert
			expect(
				container.resolve(ITestValue, { multiple: true }).map((i) => i.id),
			).toEqual([2]);
		});

		it("should allow multiple disposers to remove registrations without removing siblings", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const disposeRegistration1 = container.register(ITestValue, {
				useValue: { id: 1 },
			});
			const disposeRegistration2 = container.register(ITestValue, {
				useValue: { id: 2 },
			});
			const disposeRegistration3 = container.register(ITestValue, {
				useValue: { id: 3 },
			});

			// Act
			disposeRegistration2();
			disposeRegistration3();

			// Assert
			const instances = container.resolve(ITestValue, { multiple: true });
			expect(instances).toHaveLength(1);
			expect(instances[0].id).toBe(1);
			expect(container.resolve(ITestValue).id).toBe(1);
			expect(() => disposeRegistration1()).not.toThrow();
		});

		it("should unregister all registrations when using unregisterAll", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			container.register(ITestValue, {
				useValue: { id: 1 },
			});
			container.register(ITestValue, {
				useValue: { id: 2 },
			});

			// Act
			container.unregisterAll(ITestValue);

			// Assert
			expect(container.isRegistered(ITestValue)).toBe(false);
			expect(() => container.resolve(ITestValue)).toThrow();
		});

		it("should treat stale disposers and missing service identifiers as no-op", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const IMissingValue = createServiceIdentifier<{ id: number }>(
				"IMissingValue",
			);
			const disposeRegistration1 = container.register(ITestValue, {
				useValue: { id: 1 },
			});
			container.register(ITestValue, {
				useValue: { id: 2 },
			});

			// Act
			disposeRegistration1();

			// Assert
			expect(() => disposeRegistration1()).not.toThrow();
			expect(() => container.unregisterAll(IMissingValue)).not.toThrow();
			expect(
				container.resolve(ITestValue, { multiple: true }).map((i) => i.id),
			).toEqual([2]);
		});
	});

	describe("R2.3: Registration Plan", () => {
		it("should register all plan entries in declaration order", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const plan = createRegistrationPlan((register) => {
				register(ITestValue, { useValue: { id: 1 } });
				register(ITestValue, { useValue: { id: 2 } });
				register(IServiceA, { useClass: ServiceA });
			});

			// Act
			const cleanup = container.applyRegistrationPlan(plan);

			// Assert
			expect(
				container.resolve(ITestValue, { multiple: true }).map((i) => i.id),
			).toEqual([1, 2]);
			expect(container.resolve(ITestValue).id).toBe(2);
			expect(container.resolve(IServiceA)).toBeInstanceOf(ServiceA);

			cleanup();
			expect(container.isRegistered(ITestValue)).toBe(false);
			expect(container.isRegistered(IServiceA)).toBe(false);
		});

		it("should clean up only registrations created by the plan", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			container.register(ITestValue, { useValue: { id: 0 } });
			const plan = createRegistrationPlan((register) => {
				register(ITestValue, { useValue: { id: 1 } });
				register(ITestValue, { useValue: { id: 2 } });
			});
			const cleanup = container.applyRegistrationPlan(plan);
			container.register(ITestValue, { useValue: { id: 3 } });

			// Act
			cleanup();

			// Assert
			expect(
				container.resolve(ITestValue, { multiple: true }).map((i) => i.id),
			).toEqual([0, 3]);
			expect(container.resolve(ITestValue).id).toBe(3);
			expect(() => cleanup()).not.toThrow();
		});

		it("should roll back registered entries when a later plan entry fails", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const plan = createRegistrationPlan((register) => {
				register(ITestValue, { useValue: { id: 1 } });
				register(IServiceA, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid registration shape inside a plan
				} as any);
			});

			// Act & Assert
			expect(() => container.applyRegistrationPlan(plan)).toThrow(
				/E_INVALID_PROVIDER/,
			);
			expect(container.isRegistered(ITestValue)).toBe(false);
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

		it("should return empty array when no instances found and multiple: true, optional: true without defaultValue", () => {
			// Act
			const instances = childContainer.resolve(IUnregisteredService, {
				multiple: true,
				optional: true,
			});

			// Assert
			expect(instances).toEqual([]);
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

	describe("S7: Provider Failure Reporting", () => {
		it("should wrap provider failures in ResolveException with E_RESOLUTION_FAILED", () => {
			childContainer.register(IServiceA, {
				useFactory: () => {
					throw new Error("Factory failed");
				},
			});

			try {
				childContainer.resolve(IServiceA);
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect(error).toBeInstanceOf(ResolveException);
				expect((error as ResolveException).code).toBe(
					CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				);
				expect((error as Error).message).toContain("Factory failed");
				expect((error as Error).message).toContain("IServiceA");
			}
		});
	});

	describe("S8: Resolve Context Availability", () => {
		it("should reject package-level resolve() outside an active resolution context", () => {
			expect(() => {
				resolve(IServiceA);
			}).toThrow(/E_RESOLVE_CONTEXT_UNAVAILABLE/);
		});
	});

	describe("S9: Resolve Helper Container Scope", () => {
		it("should default to current container scope when scope is omitted", () => {
			// Arrange
			const IDatabase = createServiceIdentifier<Database>("IDatabase");
			const IDatabaseOptions = createServiceIdentifier<{ baseURL: string }>(
				"IDatabaseOptions",
			);

			class Database {
				readonly options = resolve(IDatabaseOptions);
			}

			parentContainer.register(IDatabase, {
				useClass: Database,
			});
			childContainer.register(IDatabaseOptions, {
				useValue: { baseURL: "http://localhost:3000" },
			});

			// Act & Assert
			expect(() => childContainer.resolve(IDatabase)).toThrow(
				'Service identifier "IDatabaseOptions" is not registered in this container. Please register it first or set the "optional" option to true if this service is optional.',
			);
		});

		it("should resolve from origin container when scope is set to origin", () => {
			// Arrange
			const IOriginDatabase =
				createServiceIdentifier<OriginDatabase>("IOriginDatabase");
			const IDatabaseOptions = createServiceIdentifier<{ baseURL: string }>(
				"IDatabaseOptions",
			);
			const childOptions = { baseURL: "http://localhost:3000" };

			class OriginDatabase {
				readonly options = resolve(IDatabaseOptions, {
					scope: ResolveContainerScopeEnum.origin,
				});
			}

			parentContainer.register(IOriginDatabase, {
				useClass: OriginDatabase,
			});
			childContainer.register(IDatabaseOptions, {
				useValue: childOptions,
			});

			// Act
			const database = childContainer.resolve(IOriginDatabase);

			// Assert
			expect(database).toBeInstanceOf(OriginDatabase);
			expect(database.options).toBe(childOptions);
		});
	});

	describe("S10: Resolve Helper Container Access", () => {
		it("should expose the scoped active container through resolve(IContainer)", () => {
			// Arrange
			const IContainerProbe =
				createServiceIdentifier<ContainerProbe>("IContainerProbe");

			class ContainerProbe {
				readonly currentContainer = resolve(IContainer);
				readonly currentContainerList = resolve(IContainer, {
					multiple: true,
				});
				readonly originContainer = resolve(IContainer, {
					scope: ResolveContainerScopeEnum.origin,
				});
				readonly originContainerList = resolve(IContainer, {
					scope: ResolveContainerScopeEnum.origin,
					multiple: true,
				});
			}

			parentContainer.register(IContainerProbe, {
				useClass: ContainerProbe,
			});

			// Act
			const probe = childContainer.resolve(IContainerProbe);

			// Assert
			expect(probe.currentContainer).toBe(parentContainer);
			expect(probe.currentContainerList).toEqual([parentContainer]);
			expect(probe.originContainer).toBe(childContainer);
			expect(probe.originContainerList).toEqual([childContainer]);
		});

		it("should support ref and dynamic helper options when resolving IContainer", () => {
			// Arrange
			const IContainerRefProbe =
				createServiceIdentifier<ContainerRefProbe>("IContainerRefProbe");

			class ContainerRefProbe {
				readonly currentContainerRef = resolve(IContainer, {
					ref: true,
				});
				readonly currentContainerDynamic = resolve(IContainer, {
					dynamic: true,
				});
				readonly originContainerRefList = resolve(IContainer, {
					scope: ResolveContainerScopeEnum.origin,
					multiple: true,
					ref: true,
				});
				readonly originContainerDynamicList = resolve(IContainer, {
					scope: ResolveContainerScopeEnum.origin,
					multiple: true,
					dynamic: true,
				});
			}

			parentContainer.register(IContainerRefProbe, {
				useClass: ContainerRefProbe,
			});

			// Act
			const probe = childContainer.resolve(IContainerRefProbe);

			// Assert
			expect(probe.currentContainerRef.current).toBe(parentContainer);
			expect(probe.currentContainerDynamic.current).toBe(parentContainer);
			expect(probe.originContainerRefList.current).toEqual([childContainer]);
			expect(probe.originContainerDynamicList.current).toEqual([
				childContainer,
			]);
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
		describe("useClass with transient lifecycle (default)", () => {
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

				// Assert - All instances should be different
				expect(instance1).not.toBe(instance2);
				expect(instance2).not.toBe(instance3);
				expect(instance1).not.toBe(instance3);
				expect(instance1).toBeInstanceOf(ServiceA);
				expect(instance2).toBeInstanceOf(ServiceA);
				expect(instance3).toBeInstanceOf(ServiceA);
			});

			it("should use transient lifecycle by default when not specified", () => {
				// Arrange
				container.register(IServiceA, {
					useClass: ServiceA,
					// lifecycle not specified, should default to transient
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);

				// Assert
				expect(instance1).not.toBe(instance2);
			});

			it("should create new instances with dependencies", () => {
				// Arrange
				container.register(IServiceA, {
					useClass: ServiceA,
					lifecycle: LifecycleEnum.transient,
				});
				container.register(IServiceB, {
					useFactory: (c) => new ServiceB(c.resolve(IServiceA)),
					lifecycle: LifecycleEnum.transient,
				});

				// Act
				const b1 = container.resolve(IServiceB);
				const b2 = container.resolve(IServiceB);

				// Assert - Both B instances and their A dependencies should be different
				expect(b1).not.toBe(b2);
				expect(b1.serviceA).not.toBe(b2.serviceA);
			});
		});

		describe("useFactory with transient lifecycle", () => {
			it("should call factory function every time service is resolved", () => {
				// Arrange
				let callCount = 0;
				container.register(IServiceA, {
					useFactory: () => {
						callCount++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.transient,
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);
				const instance3 = container.resolve(IServiceA);

				// Assert
				expect(callCount).toBe(3);
				expect(instance1).not.toBe(instance2);
				expect(instance2).not.toBe(instance3);
				expect(instance1).not.toBe(instance3);
			});

			it("should use transient lifecycle by default when not specified", () => {
				// Arrange
				let callCount = 0;
				container.register(IServiceA, {
					useFactory: () => {
						callCount++;
						return new ServiceA();
					},
					// lifecycle not specified, should default to transient
				});

				// Act
				container.resolve(IServiceA);
				container.resolve(IServiceA);

				// Assert
				expect(callCount).toBe(2);
			});

			it("should create fresh instances with each factory call", () => {
				// Arrange
				const timestamps: number[] = [];
				container.register(IServiceA, {
					useFactory: () => {
						const instance = new ServiceA();
						const timestamp = Date.now();
						timestamps.push(timestamp);
						(instance as ServiceA & { createdAt?: number }).createdAt =
							timestamp;
						return instance;
					},
					lifecycle: LifecycleEnum.transient,
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);

				// Assert
				expect(timestamps).toHaveLength(2);
				expect((instance1 as ServiceA & { createdAt?: number }).createdAt).toBe(
					timestamps[0],
				);
				expect((instance2 as ServiceA & { createdAt?: number }).createdAt).toBe(
					timestamps[1],
				);
			});

			it("should not cache factory results across resolutions", () => {
				// Arrange
				let counter = 0;
				container.register(IServiceA, {
					useFactory: () => {
						const instance = new ServiceA();
						(instance as ServiceA & { id?: number }).id = ++counter;
						return instance;
					},
					lifecycle: LifecycleEnum.transient,
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);
				const instance3 = container.resolve(IServiceA);

				// Assert
				expect((instance1 as ServiceA & { id?: number }).id).toBe(1);
				expect((instance2 as ServiceA & { id?: number }).id).toBe(2);
				expect((instance3 as ServiceA & { id?: number }).id).toBe(3);
			});
		});

		describe("Transient with complex dependencies", () => {
			it("should create new transient instances throughout dependency tree", () => {
				// Arrange
				let aCount = 0;
				let bCount = 0;

				container.register(IServiceA, {
					useFactory: () => {
						aCount++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.transient,
				});

				container.register(IServiceB, {
					useFactory: (c) => {
						bCount++;
						return new ServiceB(c.resolve(IServiceA));
					},
					lifecycle: LifecycleEnum.transient,
				});

				const IServiceContainer = createServiceIdentifier<{
					b1: ServiceB;
					b2: ServiceB;
					a: ServiceA;
				}>("IServiceContainer");

				container.register(IServiceContainer, {
					useFactory: (c) => ({
						b1: c.resolve(IServiceB),
						b2: c.resolve(IServiceB),
						a: c.resolve(IServiceA),
					}),
					lifecycle: LifecycleEnum.transient,
				});

				// Act
				const container1 = container.resolve(IServiceContainer);
				const container2 = container.resolve(IServiceContainer);

				// Assert
				expect(aCount).toBe(6); // 3 for container1 (b1.a, b2.a, a), 3 for container2 (b1.a, b2.a, a)
				expect(bCount).toBe(4); // 2 for container1 (b1, b2), 2 for container2 (b1, b2)
				expect(container1.b1).not.toBe(container1.b2);
				expect(container1.b1.serviceA).not.toBe(container1.b2.serviceA);
				expect(container1).not.toBe(container2);
			});
		});
	});

	describe("L2: Singleton Lifecycle", () => {
		describe("useValue (implicit singleton)", () => {
			it("should always return the same value instance", () => {
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
		});

		describe("useClass with singleton lifecycle", () => {
			it("should create instance once and reuse for all subsequent resolutions", () => {
				// Arrange
				container.register(IServiceA, {
					useClass: ServiceA,
					lifecycle: LifecycleEnum.singleton,
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);
				const instance3 = container.resolve(IServiceA);

				// Assert - All instances should be the same object reference
				expect(instance1).toBe(instance2);
				expect(instance2).toBe(instance3);
				expect(instance1).toBeInstanceOf(ServiceA);
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

				// Assert - Different containers should have different singleton instances
				expect(instance1).not.toBe(instance2);
				expect(instance1).toBeInstanceOf(ServiceA);
				expect(instance2).toBeInstanceOf(ServiceA);

				// Cleanup
				clearContainer(container2);
			});

			it("should create singleton instance only once even with dependencies", () => {
				// Arrange
				let serviceAInstances = 0;
				container.register(IServiceA, {
					useFactory: () => {
						serviceAInstances++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.singleton,
				});
				container.register(IServiceB, {
					useFactory: (c) => {
						const serviceA = c.resolve(IServiceA);
						return new ServiceB(serviceA);
					},
					lifecycle: LifecycleEnum.transient,
				});

				// Act
				const serviceB1 = container.resolve(IServiceB);
				const serviceB2 = container.resolve(IServiceB);
				const serviceA1 = container.resolve(IServiceA);

				// Assert - ServiceA should only be created once
				expect(serviceAInstances).toBe(1);
				expect(serviceB1.serviceA).toBe(serviceB2.serviceA);
				expect(serviceB1.serviceA).toBe(serviceA1);
			});
		});

		describe("useFactory with singleton lifecycle", () => {
			it("should create instance once and reuse for all subsequent resolutions", () => {
				// Arrange
				let instanceCount = 0;
				container.register(IServiceA, {
					useFactory: () => {
						instanceCount++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.singleton,
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);
				const instance3 = container.resolve(IServiceA);

				// Assert - Factory should only be called once
				expect(instanceCount).toBe(1);
				expect(instance1).toBe(instance2);
				expect(instance2).toBe(instance3);
				expect(instance1).toBeInstanceOf(ServiceA);
			});

			it("should maintain separate singleton instances per container", () => {
				// Arrange
				const container2 = createContainer("SecondContainer");
				let count1 = 0;
				let count2 = 0;

				container.register(IServiceA, {
					useFactory: () => {
						count1++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.singleton,
				});

				container2.register(IServiceA, {
					useFactory: () => {
						count2++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.singleton,
				});

				// Act
				const instance1a = container.resolve(IServiceA);
				const instance1b = container.resolve(IServiceA);
				const instance2a = container2.resolve(IServiceA);
				const instance2b = container2.resolve(IServiceA);

				// Assert
				expect(count1).toBe(1);
				expect(count2).toBe(1);
				expect(instance1a).toBe(instance1b);
				expect(instance2a).toBe(instance2b);
				expect(instance1a).not.toBe(instance2a);

				// Cleanup
				clearContainer(container2);
			});

			it("should cache complex factory results as singleton", () => {
				// Arrange
				let factoryCallCount = 0;
				container.register(IServiceA, {
					useFactory: () => {
						factoryCallCount++;
						const instance = new ServiceA();
						// Simulate complex initialization
						(instance as ServiceA & { initialized?: boolean }).initialized =
							true;
						(instance as ServiceA & { timestamp?: number }).timestamp =
							Date.now();
						return instance;
					},
					lifecycle: LifecycleEnum.singleton,
				});

				// Act
				const instance1 = container.resolve(IServiceA);
				const instance2 = container.resolve(IServiceA);

				// Assert
				expect(factoryCallCount).toBe(1);
				expect(instance1).toBe(instance2);
				expect(
					(instance1 as ServiceA & { initialized?: boolean }).initialized,
				).toBe(true);
				expect((instance1 as ServiceA & { timestamp?: number }).timestamp).toBe(
					(instance2 as ServiceA & { timestamp?: number }).timestamp,
				);
			});
		});
	});

	describe("L3: Resolution Lifecycle", () => {
		describe("useClass with resolution lifecycle", () => {
			it("should create new instance per resolution chain", () => {
				// Arrange
				container.register(IServiceA, {
					useClass: ServiceA,
					lifecycle: LifecycleEnum.resolution,
				});
				container.register(IServiceB, {
					useFactory: (c) => {
						const serviceA = c.resolve(IServiceA);
						return new ServiceB(serviceA);
					},
					lifecycle: LifecycleEnum.transient,
				});
				container.register(IServiceC, {
					useFactory: (c) => {
						// Resolve ServiceA again in same resolution context
						c.resolve(IServiceA);
						return new ServiceC();
					},
					lifecycle: LifecycleEnum.transient,
				});

				// Act - First resolution chain
				const serviceB1 = container.resolve(IServiceB);
				// Create separate resolution chain
				container.resolve(IServiceC);

				// Act - Second resolution chain
				const serviceB2 = container.resolve(IServiceB);

				// Assert - Should create new instance per resolution chain
				expect(serviceB1.serviceA).not.toBe(serviceB2.serviceA);
				expect(serviceB1.serviceA).toBeInstanceOf(ServiceA);
				expect(serviceB2.serviceA).toBeInstanceOf(ServiceA);
			});

			it("should reuse same class instance within single resolution context", () => {
				// Arrange
				let constructorCallCount = 0;
				const IServiceAWithCount =
					createServiceIdentifier<ServiceA>("IServiceAWithCount");

				class ServiceAWithCount extends ServiceA {
					constructor() {
						super();
						constructorCallCount++;
					}
				}

				container.register(IServiceAWithCount, {
					useClass: ServiceAWithCount,
					lifecycle: LifecycleEnum.resolution,
				});
				container.register(IServiceB, {
					useFactory: (c) => {
						const serviceA = c.resolve(IServiceAWithCount);
						return new ServiceB(serviceA);
					},
				});
				container.register(IServiceC, {
					useFactory: (c) => {
						// Resolve ServiceA again in same resolution context
						c.resolve(IServiceAWithCount);
						return new ServiceC();
					},
				});

				// Act - Two separate resolution chains
				container.resolve(IServiceB);
				container.resolve(IServiceC);

				// Assert - ServiceA constructor should only be called once per resolution
				expect(constructorCallCount).toBe(2); // Once for B chain, once for C chain
			});
		});

		describe("useFactory with resolution lifecycle", () => {
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

				// Act - First resolution chain
				const serviceB1 = container.resolve(IServiceB);

				// Act - Second resolution chain
				const serviceB2 = container.resolve(IServiceB);

				// Assert - Should create new instance per resolution chain
				expect(serviceB1.serviceA).not.toBe(serviceB2.serviceA);
				expect(instanceCount).toBe(2);
			});

			it("should reuse same factory instance within single resolution context", () => {
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

			it("should share resolution-scoped instance across complex dependency tree", () => {
				// Arrange
				let factoryCallCount = 0;
				const instances: ServiceA[] = [];

				container.register(IServiceA, {
					useFactory: () => {
						factoryCallCount++;
						const instance = new ServiceA();
						instances.push(instance);
						return instance;
					},
					lifecycle: LifecycleEnum.resolution,
				});

				// Create multiple services that all depend on ServiceA
				const IServiceX = createServiceIdentifier<{ a: ServiceA }>("IServiceX");
				const IServiceY = createServiceIdentifier<{ a: ServiceA }>("IServiceY");
				const IServiceZ = createServiceIdentifier<{
					x: { a: ServiceA };
					y: { a: ServiceA };
					a: ServiceA;
				}>("IServiceZ");

				container.register(IServiceX, {
					useFactory: (c) => ({ a: c.resolve(IServiceA) }),
				});
				container.register(IServiceY, {
					useFactory: (c) => ({ a: c.resolve(IServiceA) }),
				});
				container.register(IServiceZ, {
					useFactory: (c) => ({
						x: c.resolve(IServiceX),
						y: c.resolve(IServiceY),
						a: c.resolve(IServiceA),
					}),
				});

				// Act - Single resolution that triggers multiple ServiceA resolutions
				const serviceZ = container.resolve(IServiceZ);

				// Assert - All should reference the same ServiceA instance
				expect(factoryCallCount).toBe(1);
				expect(serviceZ.x.a).toBe(serviceZ.y.a);
				expect(serviceZ.y.a).toBe(serviceZ.a);
				expect(instances).toHaveLength(1);
			});
		});

		describe("Mixed lifecycle behaviors", () => {
			it("should respect resolution lifecycle for factory within singleton class", () => {
				// Arrange
				let resolutionScopedCount = 0;

				container.register(IServiceA, {
					useFactory: () => {
						resolutionScopedCount++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.resolution,
				});

				const ISingletonService = createServiceIdentifier<{ a: ServiceA }>(
					"ISingletonService",
				);
				container.register(ISingletonService, {
					useFactory: (c) => {
						return { a: c.resolve(IServiceA) };
					},
					lifecycle: LifecycleEnum.singleton,
				});

				// Act
				const singleton1 = container.resolve(ISingletonService);
				const singleton2 = container.resolve(ISingletonService);
				const directA = container.resolve(IServiceA);

				// Assert
				expect(singleton1).toBe(singleton2); // Singleton behavior
				expect(singleton1.a).toBe(singleton2.a); // Same instance in singleton
				expect(singleton1.a).not.toBe(directA); // Different resolution context
				expect(resolutionScopedCount).toBe(2); // Once for singleton creation, once for direct resolve
			});
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

	describe("M3: Global vs Local Middleware Strategy", () => {
		it("should execute local middlewares before global middlewares (Local wraps Global)", () => {
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

			// Assert - Local middleware is outermost layer, executes first
			// This follows LIFO: Local (later registered) wraps Global (earlier registered)
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

		it("should allow local middleware to bypass global middleware (override capability)", () => {
			// Arrange
			const mockInstance = new ServiceA();
			let globalExecuted = false;

			globalMiddleware.use({
				name: "globalAuthMw",
				executor: (params, next) => {
					globalExecuted = true;
					// Simulate global authentication logic
					return next(params);
				},
			});

			container.use({
				name: "localMockMw",
				executor: (_params, _next) => {
					// Local middleware bypasses global by not calling next()
					// This is useful for testing/mocking scenarios
					return mockInstance;
				},
			});

			container.register(IServiceA, { useClass: ServiceA });

			// Act
			const instance = container.resolve(IServiceA);

			// Assert - Local middleware short-circuited the chain
			expect(instance).toBe(mockInstance);
			expect(globalExecuted).toBe(false);
		});

		it("should allow local middleware to enrich context before passing to global", () => {
			// Arrange
			const contextModifications: string[] = [];

			globalMiddleware.use({
				name: "globalContextMw",
				executor: (params, next) => {
					// Global middleware sees the modified params
					if (
						params &&
						typeof params === "object" &&
						"enrichedByLocal" in params
					) {
						contextModifications.push("global-sees-enriched-context");
					}
					return next(params);
				},
			});

			container.use({
				name: "localEnrichMw",
				executor: (params, next) => {
					// Local middleware enriches context
					contextModifications.push("local-enriches-context");
					const enrichedParams = {
						...params,
						enrichedByLocal: true,
					};
					return next(enrichedParams);
				},
			});

			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert - Context flows from Local to Global
			expect(contextModifications).toEqual([
				"local-enriches-context",
				"global-sees-enriched-context",
			]);
		});

		it("should demonstrate isolation: child container does not inherit parent's local middlewares", () => {
			// Arrange
			const executionOrder: string[] = [];

			const parentContainer = createContainer("ParentContainer");
			const childContainer = createContainer("ChildContainer", parentContainer);

			// Parent has its own local middleware
			parentContainer.use({
				name: "parentLocalMw",
				executor: (params, next) => {
					executionOrder.push("parent-local");
					return next(params);
				},
			});

			// Child has its own local middleware
			childContainer.use({
				name: "childLocalMw",
				executor: (params, next) => {
					executionOrder.push("child-local");
					return next(params);
				},
			});

			childContainer.register(IServiceA, { useClass: ServiceA });

			// Act
			childContainer.resolve(IServiceA);

			// Assert - Only child's local middleware and global middleware execute
			// Parent's local middleware is NOT inherited
			expect(executionOrder).toEqual(["child-local"]);

			// Cleanup
			clearContainer(childContainer);
			clearContainer(parentContainer);
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
		it("should return a disposer that removes a local middleware", () => {
			// Arrange
			let callCount = 0;
			const middleware = {
				name: "localDisposerMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => {
					callCount++;
					return next(params);
				},
			};
			const disposeMiddleware = container.use(middleware);
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);
			disposeMiddleware();
			container.resolve(IServiceA);

			// Assert
			expect(callCount).toBe(1);
			expect(() => disposeMiddleware()).not.toThrow();
		});

		it("should return a disposer that removes a global middleware", () => {
			// Arrange
			let callCount = 0;
			const middleware = {
				name: "globalDisposerMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => {
					callCount++;
					return next(params);
				},
			};
			const disposeMiddleware = globalMiddleware.use(middleware);
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);
			disposeMiddleware();
			container.resolve(IServiceA);

			// Assert
			expect(callCount).toBe(1);
			expect(() => disposeMiddleware()).not.toThrow();
		});

		it("should return a cleanup function that removes an event listener", () => {
			// Arrange
			let callCount = 0;
			const cleanup = globalMiddleware.on("change", () => {
				callCount++;
			});
			const middleware = {
				name: "eventCleanupMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
			};

			// Act
			globalMiddleware.use(middleware);
			cleanup();
			globalMiddleware.unused(middleware);

			// Assert
			expect(callCount).toBe(1);
			expect(typeof cleanup).toBe("function");
			expect(() => cleanup()).not.toThrow();
		});

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

	describe("M6: Middleware Disposal Hook", () => {
		it("should call onContainerDispose when container is disposed", () => {
			// Arrange
			let disposeCalled = false;
			let disposedContainer: IContainer | null = null;
			const middleware = {
				name: "disposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: (container: IContainer) => {
					disposeCalled = true;
					disposedContainer = container;
				},
			};

			container.use(middleware);

			// Act
			container.dispose();

			// Assert
			expect(disposeCalled).toBe(true);
			expect(disposedContainer).toBe(container);
		});

		it("should call onContainerDispose for both local and global middlewares", () => {
			// Arrange
			let localDisposeCalled = false;
			let globalDisposeCalled = false;

			const localMiddleware = {
				name: "localDisposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: () => {
					localDisposeCalled = true;
				},
			};

			const globalMiddlewareObj = {
				name: "globalDisposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: () => {
					globalDisposeCalled = true;
				},
			};

			container.use(localMiddleware);
			globalMiddleware.use(globalMiddlewareObj);

			// Act
			container.dispose();

			// Assert
			expect(localDisposeCalled).toBe(true);
			expect(globalDisposeCalled).toBe(true);
		});

		it("should ignore errors thrown in onContainerDispose", () => {
			// Arrange
			const errorMiddleware = {
				name: "errorDisposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: () => {
					throw new Error("Disposal error");
				},
			};

			const successMiddleware = {
				name: "successDisposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: () => {
					// This should still be called even if previous middleware throws
				},
			};

			container.use(errorMiddleware);
			container.use(successMiddleware);

			// Act & Assert - Should not throw
			expect(() => {
				container.dispose();
			}).not.toThrow();
			expect(container.disposed).toBe(true);
		});

		it("should use onContainerDispose for cleanup operations", () => {
			// Arrange
			const cache = new Map<string, unknown>();
			cache.set("key1", "value1");
			cache.set("key2", "value2");

			const cacheMiddleware = {
				name: "cacheMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => {
					const result = next(params);
					cache.set("cached", result);
					return result;
				},
				onContainerDispose: () => {
					// Cleanup cache
					cache.clear();
				},
			};

			container.use(cacheMiddleware);
			container.register(IServiceA, { useClass: ServiceA });

			// Populate cache
			container.resolve(IServiceA);
			expect(cache.size).toBeGreaterThan(0);

			// Act
			container.dispose();

			// Assert - Cache should be cleared
			expect(cache.size).toBe(0);
		});

		it("should not call onContainerDispose on parent when child is disposed", () => {
			// Arrange
			const parentContainer = createContainer("ParentContainer");
			const childContainer = createContainer("ChildContainer", parentContainer);

			let parentDisposeCalled = false;
			let childDisposeCalled = false;

			const parentMiddleware = {
				name: "parentDisposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: () => {
					parentDisposeCalled = true;
				},
			};

			const childMiddleware = {
				name: "childDisposeMiddleware",
				// biome-ignore lint/suspicious/noExplicitAny: Test middleware needs flexible typing
				executor: (params: any, next: any) => next(params),
				onContainerDispose: () => {
					childDisposeCalled = true;
				},
			};

			parentContainer.use(parentMiddleware);
			childContainer.use(childMiddleware);

			// Act - Dispose only child
			childContainer.dispose();

			// Assert
			expect(childDisposeCalled).toBe(true);
			expect(parentDisposeCalled).toBe(false);
			expect(childContainer.disposed).toBe(true);
			expect(parentContainer.disposed).toBe(false);

			// Cleanup
			clearContainer(parentContainer);
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
			expect(() => container.unregisterAll(IServiceA)).toThrow();
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

	describe("V1: Provider Validation", () => {
		it("should reject registrations that specify zero or multiple provider strategies", () => {
			expect(() => {
				container.register(IServiceA, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid registration shape
				} as any);
			}).toThrow(/E_INVALID_PROVIDER/);

			expect(() => {
				container.register(IServiceA, {
					useClass: ServiceA,
					useFactory: () => new ServiceA(),
				});
			}).toThrow(/E_INVALID_PROVIDER/);
		});
	});

	describe("V2: Class Provider Validation", () => {
		it("should accept valid constructor function for useClass", () => {
			// Act & Assert
			expect(() => {
				container.register(IServiceA, { useClass: ServiceA });
			}).not.toThrow();
		});

		it("should reject non-function useClass providers", () => {
			expect(() => {
				container.register(IServiceA, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid provider type
					useClass: "ServiceA" as any,
				});
			}).toThrow(/E_INVALID_PROVIDER/);
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

		it("should reject non-function useFactory providers", () => {
			expect(() => {
				container.register(IServiceA, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid provider type
					useFactory: "factory" as any,
				});
			}).toThrow(/E_INVALID_PROVIDER/);
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

		it("should reject invalid useAlias service identifiers", () => {
			expect(() => {
				container.register(IAliasTarget, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid service identifier
					useAlias: "" as any,
				});
			}).toThrow(/E_INVALID_PROVIDER/);
		});

		it("should reject non-function getContainer values", () => {
			expect(() => {
				container.register(IAliasTarget, {
					useAlias: IServiceA,
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid getContainer type
					getContainer: "container" as any,
				});
			}).toThrow(/E_INVALID_PROVIDER/);
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

		it("should reject defaultValue when optional is not true", () => {
			expect(() => {
				container.resolve(IServiceA, {
					defaultValue: new ServiceA(),
					// biome-ignore lint/suspicious/noExplicitAny: use any
				} as any);
			}).toThrow(/E_INVALID_OPTIONS/);
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

		it("should reject non-array defaultValue when multiple is true", () => {
			expect(() => {
				container.resolve(IServiceA, {
					multiple: true,
					optional: true,
					defaultValue: new ServiceA() as unknown as [],
				});
			}).toThrow(/E_INVALID_OPTIONS/);
		});

		it("should reject dynamic and ref options used together", () => {
			expect(() => {
				container.resolve(IServiceA, {
					dynamic: true,
					ref: true,
				});
			}).toThrow(/E_INVALID_OPTIONS/);
		});
	});
});
