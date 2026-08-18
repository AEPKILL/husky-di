/**
 * @overview Core container specification compliance tests.
 *
 * This test suite validates that the container implementation complies with
 * the behavioral contract defined in SPECIFICATION.md v1.3.0.
 *
 * Each test is labeled with its corresponding specification requirement ID
 * (e.g., R1, S2, L1, etc.) for traceability.
 *
 * @author AEPKILL
 * @created 2025-11-28 17:39:24
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import {
	CoreErrorCodeEnum,
	type CreatedServiceIdentifier,
	type CreateServiceIdentifierOptions,
	createContainer,
	createRegistrationPlan,
	createServiceIdentifier,
	getServiceIdentifierMetadata,
	getServiceIdentifierName,
	hasServiceIdentifierMetadata,
	IContainer,
	LifecycleEnum,
	middleware,
	ResolveContainerScopeEnum,
	type ResolveContext,
	ResolveException,
	type ResolveMiddleware,
	type ResolveOptions,
	resolve,
	type ServiceIdentifierInstance,
} from "../src/index";
import { clearContainer, clearMiddleware, useMiddleware } from "./test.utils";

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
		it("should expose ResolveContext from the package root", () => {
			const context: ResolveContext = new Map();

			expect(context).toBeInstanceOf(Map);
		});

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

		it("should allow applying the same plan multiple times to the same container", () => {
			// Arrange
			const ITestValue = createServiceIdentifier<{ id: number }>("ITestValue");
			const plan = createRegistrationPlan((register) => {
				register(ITestValue, { useValue: { id: 1 } });
				register(ITestValue, { useValue: { id: 2 } });
			});

			// Act
			const cleanup1 = container.applyRegistrationPlan(plan);
			const cleanup2 = container.applyRegistrationPlan(plan);

			// Assert
			expect(
				container.resolve(ITestValue, { multiple: true }).map((i) => i.id),
			).toEqual([1, 2, 1, 2]);
			expect(container.resolve(ITestValue).id).toBe(2);

			cleanup2();
			expect(
				container.resolve(ITestValue, { multiple: true }).map((i) => i.id),
			).toEqual([1, 2]);
			expect(container.resolve(ITestValue).id).toBe(2);

			cleanup1();
			expect(container.isRegistered(ITestValue)).toBe(false);
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
		clearMiddleware();
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

	describe("S1.1: Service Identifier Metadata", () => {
		it("should infer the instance type from created identifiers", () => {
			// Arrange
			const stringIdentifier = createServiceIdentifier<ServiceA>(
				"IInferredStringService",
			);
			const rawSymbol = Symbol("IInferredSymbolService");
			const symbolIdentifier = createServiceIdentifier<ServiceA>(rawSymbol);

			// Assert
			expectTypeOf<
				ServiceIdentifierInstance<typeof stringIdentifier>
			>().toEqualTypeOf<ServiceA>();
			expectTypeOf<
				ServiceIdentifierInstance<typeof symbolIdentifier>
			>().toEqualTypeOf<ServiceA>();
			expectTypeOf(stringIdentifier).toMatchTypeOf<
				CreatedServiceIdentifier<ServiceA>
			>();
			expect(stringIdentifier).toBe("IInferredStringService");
			expect(symbolIdentifier).toBe(rawSymbol);
		});

		it("should expose metadata options from the package root", () => {
			// Arrange
			const options: CreateServiceIdentifierOptions<{ tag: string }> = {
				metadata: { tag: "root-export" },
			};

			// Act
			const identifier = createServiceIdentifier<ServiceA, { tag: string }>(
				"IRootExportMetadata",
				options,
			);

			// Assert
			expect(getServiceIdentifierMetadata(identifier)).toEqual({
				tag: "root-export",
			});
		});

		it("should return associated metadata and preserve registration and resolution semantics", () => {
			// Arrange
			const metadata = {
				module: "user",
				transport: "http",
			};
			const serviceIdentifier = createServiceIdentifier<
				ServiceA,
				typeof metadata
			>("IServiceWithMetadata", {
				metadata,
			});

			childContainer.register(serviceIdentifier, {
				useClass: ServiceA,
			});

			// Act
			const resolvedMetadata =
				getServiceIdentifierMetadata<typeof metadata>(serviceIdentifier);
			const instance = childContainer.resolve("IServiceWithMetadata");
			const identifierName = getServiceIdentifierName(serviceIdentifier);

			// Assert
			expect(resolvedMetadata).toEqual(metadata);
			expect(hasServiceIdentifierMetadata(serviceIdentifier)).toBe(true);
			expect(instance).toBeInstanceOf(ServiceA);
			expect(identifierName).toBe("IServiceWithMetadata");
		});

		it("should return undefined and false when no metadata association exists", () => {
			// Arrange
			const serviceIdentifier = createServiceIdentifier<ServiceA>(
				"IServiceWithoutMetadataInSpec",
			);

			// Act
			const resolvedMetadata = getServiceIdentifierMetadata(serviceIdentifier);
			const hasMetadata = hasServiceIdentifierMetadata(serviceIdentifier);

			// Assert
			expect(resolvedMetadata).toBeUndefined();
			expect(hasMetadata).toBe(false);
		});

		it("should treat string metadata association as keyed by string equality", () => {
			// Arrange
			const metadata = {
				tag: "billing",
			};

			createServiceIdentifier<ServiceA, typeof metadata>("IStringMetadataKey", {
				metadata,
			});

			// Act
			const resolvedMetadata =
				getServiceIdentifierMetadata<typeof metadata>("IStringMetadataKey");
			const hasMetadata = hasServiceIdentifierMetadata("IStringMetadataKey");

			// Assert
			expect(resolvedMetadata).toEqual(metadata);
			expect(hasMetadata).toBe(true);
		});

		it("should treat symbol metadata association as keyed by symbol identity", () => {
			// Arrange
			const metadata = {
				tag: "remote",
			};
			const symbolIdentifier = Symbol("ISymbolMetadataKey");

			createServiceIdentifier<ServiceA, typeof metadata>(symbolIdentifier, {
				metadata,
			});

			// Act
			const resolvedMetadata =
				getServiceIdentifierMetadata<typeof metadata>(symbolIdentifier);
			const hasMetadata = hasServiceIdentifierMetadata(symbolIdentifier);

			// Assert
			expect(resolvedMetadata).toEqual(metadata);
			expect(hasMetadata).toBe(true);
		});

		it("should report metadata association when metadata is explicitly undefined", () => {
			// Arrange
			const options: CreateServiceIdentifierOptions<string> = {
				metadata: undefined,
			};
			const serviceIdentifier = createServiceIdentifier<ServiceA>(
				"IUndefinedMetadataInSpec",
				options,
			);

			// Act
			const resolvedMetadata = getServiceIdentifierMetadata(serviceIdentifier);
			const hasMetadata = hasServiceIdentifierMetadata(serviceIdentifier);

			// Assert
			expect(resolvedMetadata).toBeUndefined();
			expect(hasMetadata).toBe(true);
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
		it("should wrap an auto-resolved class in a multiple result array", () => {
			// Arrange
			class AutoResolvedService {}

			// Act
			const instances = childContainer.resolve(AutoResolvedService, {
				multiple: true,
			});

			// Assert
			expect(instances).toHaveLength(1);
			expect(instances[0]).toBeInstanceOf(AutoResolvedService);
		});

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
			const instances = childContainer.resolve(IMultiService, {
				multiple: true,
				optional: true,
			});

			// Assert
			expectTypeOf(instances).toEqualTypeOf<ServiceA[]>();
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
		for (const referenceType of ["ref", "dynamic"] as const) {
			it(`should restore an active resolution after reading ${referenceType}.current`, () => {
				// Arrange
				const IScoped = createServiceIdentifier<ServiceA>(
					`I${referenceType}Scoped`,
				);
				const IDeferredValue = createServiceIdentifier<number>(
					`I${referenceType}DeferredValue`,
				);
				const IResult = createServiceIdentifier<{
					readonly sameInstance: boolean;
					readonly value: number;
				}>(`I${referenceType}Result`);
				let scopedInstanceCount = 0;

				childContainer.register(IScoped, {
					useFactory: () => {
						scopedInstanceCount++;
						return new ServiceA();
					},
					lifecycle: LifecycleEnum.resolution,
				});
				childContainer.register(IDeferredValue, { useValue: 42 });
				childContainer.register(IResult, {
					useFactory: () => {
						const firstInstance = resolve(IScoped);
						const deferred =
							referenceType === "ref"
								? resolve(IDeferredValue, { ref: true })
								: resolve(IDeferredValue, { dynamic: true });
						const value = deferred.current;
						const secondInstance = resolve(IScoped);

						return {
							sameInstance: firstInstance === secondInstance,
							value,
						};
					},
				});

				// Act
				const result = childContainer.resolve(IResult);

				// Assert
				expect(result).toEqual({ sameInstance: true, value: 42 });
				expect(scopedInstanceCount).toBe(1);
			});
		}

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

		it("should reject unresolved parent references after their originating child is disposed", () => {
			for (const referenceType of ["ref", "dynamic"] as const) {
				// Arrange
				const parentContainer = createContainer(
					`DisposedRefParent-${referenceType}`,
				);
				const childContainer = createContainer(
					`DisposedRefChild-${referenceType}`,
					parentContainer,
				);
				parentContainer.register(IServiceA, { useClass: ServiceA });
				const instanceRef =
					referenceType === "ref"
						? childContainer.resolve(IServiceA, { ref: true })
						: childContainer.resolve(IServiceA, { dynamic: true });

				// Act
				childContainer.dispose();

				try {
					// Assert
					expect(() => instanceRef.current).toThrow(/E_CONTAINER_DISPOSED/);
				} finally {
					parentContainer.dispose();
				}
			}
		});

		it("should retain a resolved static parent ref after its originating child is disposed", () => {
			// Arrange
			const parentContainer = createContainer("ResolvedRefParent");
			const childContainer = createContainer(
				"ResolvedRefChild",
				parentContainer,
			);
			parentContainer.register(IServiceA, { useClass: ServiceA });
			const instanceRef = childContainer.resolve(IServiceA, { ref: true });
			const instance = instanceRef.current;

			// Act
			childContainer.dispose();

			try {
				// Assert
				expect(instanceRef.current).toBe(instance);
			} finally {
				parentContainer.dispose();
			}
		});

		it("should bind a ref created inside an ancestor factory to that ancestor", () => {
			// Arrange
			const parentContainer = createContainer("NestedRefParent");
			const firstChild = createContainer(
				"NestedRefFirstChild",
				parentContainer,
			);
			const secondChild = createContainer(
				"NestedRefSecondChild",
				parentContainer,
			);
			const IDeferred = createServiceIdentifier<ServiceA>("INestedDeferred");
			const IRefFactory = createServiceIdentifier<{
				readonly current: ServiceA;
				readonly resolved: boolean;
			}>("INestedRefFactory");
			parentContainer.register(IDeferred, { useClass: ServiceA });
			parentContainer.register(IRefFactory, {
				useFactory: () => resolve(IDeferred, { ref: true }),
				lifecycle: LifecycleEnum.singleton,
			});
			const instanceRef = firstChild.resolve(IRefFactory);

			// Act
			firstChild.dispose();

			try {
				// Assert
				expect(secondChild.resolve(IRefFactory)).toBe(instanceRef);
				expect(instanceRef.current).toBeInstanceOf(ServiceA);
			} finally {
				secondChild.dispose();
				parentContainer.dispose();
			}
		});

		it("should reject unresolved ancestor refs after their active ancestor is disposed", () => {
			for (const referenceType of ["ref", "dynamic"] as const) {
				// Arrange
				const parentContainer = createContainer(
					`DisposedAncestorRefParent-${referenceType}`,
				);
				const childContainer = createContainer(
					`DisposedAncestorRefChild-${referenceType}`,
					parentContainer,
				);
				const IDeferred = createServiceIdentifier<ServiceA>(
					`IDisposedAncestorDeferred-${referenceType}`,
				);
				const IRefFactory = createServiceIdentifier<{
					readonly current: ServiceA;
					readonly resolved: boolean;
				}>(`IDisposedAncestorRefFactory-${referenceType}`);
				parentContainer.register(IDeferred, { useClass: ServiceA });
				parentContainer.register(IRefFactory, {
					useFactory: () =>
						referenceType === "ref"
							? resolve(IDeferred, { ref: true })
							: resolve(IDeferred, { dynamic: true }),
				});
				const instanceRef = childContainer.resolve(IRefFactory);

				// Act
				parentContainer.dispose();

				try {
					// Assert
					expect(() => instanceRef.current).toThrow(/E_CONTAINER_DISPOSED/);
				} finally {
					childContainer.dispose();
				}
			}
		});

		it("should resolve missing ancestor refs against their active ancestor", () => {
			for (const referenceType of ["ref", "dynamic"] as const) {
				for (const optional of [false, true]) {
					// Arrange
					const parentContainer = createContainer(
						`MissingRefParent-${referenceType}-${optional}`,
					);
					const childContainer = createContainer(
						`MissingRefChild-${referenceType}-${optional}`,
						parentContainer,
					);
					const IMissing = createServiceIdentifier<ServiceA>(
						`IMissingRef-${referenceType}-${optional}`,
					);
					const IRefFactory = createServiceIdentifier<{
						readonly current: ServiceA | undefined;
						readonly resolved: boolean;
					}>(`IMissingRefFactory-${referenceType}-${optional}`);
					parentContainer.register(IRefFactory, {
						useFactory: () => {
							if (referenceType === "ref") {
								return optional
									? resolve(IMissing, { optional: true, ref: true })
									: resolve(IMissing, { ref: true });
							}
							return optional
								? resolve(IMissing, { dynamic: true, optional: true })
								: resolve(IMissing, { dynamic: true });
						},
					});
					const instanceRef = childContainer.resolve(IRefFactory);

					// Act
					childContainer.dispose();

					try {
						// Assert
						if (optional) {
							expect(instanceRef.current).toBeUndefined();
						} else {
							expect(() => instanceRef.current).toThrow(/E_SERVICE_NOT_FOUND/);
						}
					} finally {
						parentContainer.dispose();
					}
				}
			}
		});
	});

	describe("S6: Alias Resolution", () => {
		it("should keep multiple alias results flat and registration-shaped", () => {
			// Arrange
			const ITarget = createServiceIdentifier<string>("IMultipleAliasTarget");
			const IAlias = createServiceIdentifier<string>("IMultipleAlias");
			childContainer.register(ITarget, { useValue: "first" });
			childContainer.register(ITarget, { useValue: "last" });
			childContainer.register(IAlias, { useAlias: ITarget });

			// Act
			const instances = childContainer.resolve(IAlias, { multiple: true });

			// Assert
			expect(instances).toEqual(["last"]);
		});

		it("should not forward outer multiple defaults to a missing alias target", () => {
			// Arrange
			const IMissingTarget = createServiceIdentifier<string>(
				"IMissingMultipleAliasTarget",
			);
			const IAlias = createServiceIdentifier<string>("IMissingMultipleAlias");
			childContainer.register(IAlias, { useAlias: IMissingTarget });

			// Act & Assert
			expect(() =>
				childContainer.resolve(IAlias, {
					multiple: true,
					optional: true,
					defaultValue: ["fallback"],
				}),
			).toThrow(/E_SERVICE_NOT_FOUND/);
		});

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
		it("should identify the ancestor container that owns a failing provider", () => {
			// Arrange
			parentContainer.register(IServiceA, {
				useFactory: () => {
					throw new Error("Parent factory failed");
				},
			});

			// Act & Assert
			try {
				childContainer.resolve(IServiceA);
				throw new Error("Expected resolve to throw.");
			} catch (error) {
				expect((error as Error).message).toContain(
					`in "${parentContainer.displayName}"`,
				);
			}
		});

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

		it("should recreate dynamic IContainer results on every access", () => {
			// Arrange
			const IContainerDynamicProbe = createServiceIdentifier<{
				readonly current: IContainer[];
				readonly resolved: boolean;
			}>("IContainerDynamicProbe");
			parentContainer.register(IContainerDynamicProbe, {
				useFactory: () =>
					resolve(IContainer, {
						dynamic: true,
						multiple: true,
					}),
			});

			// Act
			const dynamicContainerList = childContainer.resolve(
				IContainerDynamicProbe,
			);
			const first = dynamicContainerList.current;
			first.length = 0;
			const second = dynamicContainerList.current;

			// Assert
			expect(second).toEqual([parentContainer]);
			expect(second).not.toBe(first);
		});

		it("should keep synthetic IContainer refs readable after origin disposal", () => {
			// Arrange
			const parentContainer = createContainer("SyntheticRefParent");
			const childContainer = createContainer(
				"SyntheticRefChild",
				parentContainer,
			);
			const IProbe = createServiceIdentifier<
				readonly [
					{ readonly current: IContainer },
					{ readonly current: IContainer },
				]
			>("ISyntheticContainerRefProbe");
			parentContainer.register(IProbe, {
				useFactory: () =>
					[
						resolve(IContainer, { ref: true }),
						resolve(IContainer, { dynamic: true }),
					] as const,
			});
			const [staticRef, dynamicRef] = childContainer.resolve(IProbe);

			// Act
			childContainer.dispose();

			try {
				// Assert
				expect(staticRef.current).toBe(parentContainer);
				expect(dynamicRef.current).toBe(parentContainer);
			} finally {
				parentContainer.dispose();
			}
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
		clearMiddleware();
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
		it("should cache resolution providers without caching middleware transforms", () => {
			// Arrange
			const IScoped = createServiceIdentifier<{ readonly value: number }>(
				"IMiddlewareScoped",
			);
			const IPair = createServiceIdentifier<
				readonly [{ readonly value: number }, { readonly value: number }]
			>("IMiddlewareScopedPair");
			let providerCalls = 0;
			let middlewareCalls = 0;
			useMiddleware({
				name: "resolutionTransformMiddleware",
				executor: (params, next) => {
					const instance = next(params);
					if (params.serviceIdentifier !== IScoped) {
						return instance;
					}
					middlewareCalls++;
					return { ...instance };
				},
			});
			container.register(IScoped, {
				useFactory: () => ({ value: ++providerCalls }),
				lifecycle: LifecycleEnum.resolution,
			});
			container.register(IPair, {
				useFactory: (currentContainer) =>
					[
						currentContainer.resolve(IScoped),
						currentContainer.resolve(IScoped),
					] as const,
			});

			// Act
			const firstPair = container.resolve(IPair);
			const secondPair = container.resolve(IPair);

			// Assert
			expect(firstPair[0]).not.toBe(firstPair[1]);
			expect(firstPair[0].value).toBe(firstPair[1].value);
			expect(secondPair[0]).not.toBe(secondPair[1]);
			expect(secondPair[0].value).toBe(secondPair[1].value);
			expect(firstPair[0]).not.toBe(secondPair[0]);
			expect(providerCalls).toBe(2);
			expect(middlewareCalls).toBe(4);
		});

		it("should share one ResolveContext across child and parent factories", () => {
			// Arrange
			const parentContainer = createContainer("SharedContextParent");
			const childContainer = createContainer(
				"SharedContextChild",
				parentContainer,
			);
			const IParentContext = createServiceIdentifier<ResolveContext>(
				"IParentResolveContext",
			);
			const IContextPair = createServiceIdentifier<
				readonly [ResolveContext, ResolveContext]
			>("IResolveContextPair");

			parentContainer.register(IParentContext, {
				useFactory: (_container, context) => context,
			});
			childContainer.register(IContextPair, {
				useFactory: (_container, context) =>
					[context, resolve(IParentContext)] as const,
			});

			try {
				// Act
				const [childContext, parentContext] =
					childContainer.resolve(IContextPair);

				// Assert
				expect(parentContext).toBe(childContext);
			} finally {
				childContainer.dispose();
				parentContainer.dispose();
			}
		});

		it("should create a new ancestor instance for each child resolution chain", () => {
			// Arrange
			const parentContainer = createContainer("ResolutionLifecycleParent");
			const childContainer = createContainer(
				"ResolutionLifecycleChild",
				parentContainer,
			);
			let instanceCount = 0;

			parentContainer.register(IServiceA, {
				useFactory: () => {
					instanceCount++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.resolution,
			});

			try {
				// Act
				const firstInstance = childContainer.resolve(IServiceA);
				const secondInstance = childContainer.resolve(IServiceA);

				// Assert
				expect(firstInstance).not.toBe(secondInstance);
				expect(instanceCount).toBe(2);
			} finally {
				childContainer.dispose();
				parentContainer.dispose();
			}
		});

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

		it("should track the active container and cycles during multiple resolution", () => {
			// Arrange
			const parentContainer = createContainer("MultipleCycleParent");
			const childContainer = createContainer(
				"MultipleCycleChild",
				parentContainer,
			);
			const IMultipleCycle = createServiceIdentifier<number>("IMultipleCycle");
			let activeContainer: IContainer | undefined;
			let attemptCount = 0;

			parentContainer.register(IMultipleCycle, {
				useFactory: () => {
					attemptCount++;
					activeContainer = resolve(IContainer);

					if (attemptCount > 1) {
						throw new Error("Multiple cycle was not detected");
					}

					return resolve(IMultipleCycle, { multiple: true })[0];
				},
			});

			try {
				// Act
				let error: ResolveException | undefined;
				try {
					childContainer.resolve(IMultipleCycle, { multiple: true });
				} catch (thrownError) {
					error = thrownError as ResolveException;
				}

				// Assert
				expect(error?.code).toBe(CoreErrorCodeEnum.E_CIRCULAR_DEPENDENCY);
				expect(activeContainer).toBe(parentContainer);
				expect(attemptCount).toBe(1);
			} finally {
				childContainer.dispose();
				parentContainer.dispose();
			}
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

	describe("C4: Failed Branch Recovery", () => {
		it("should restore the resolution path after a handled nested failure", () => {
			// Arrange
			const IRetry = createServiceIdentifier<number>("IRetry");
			const IConsumer = createServiceIdentifier<number>("IRetryConsumer");
			let attemptCount = 0;

			container.register(IRetry, {
				useFactory: () => {
					attemptCount++;
					if (attemptCount === 1) {
						throw new Error("Recoverable failure");
					}
					return 42;
				},
			});
			container.register(IConsumer, {
				useFactory: () => {
					try {
						resolve(IRetry);
					} catch {
						// The factory deliberately recovers and retries.
					}
					return resolve(IRetry);
				},
			});

			// Act
			const result = container.resolve(IConsumer);

			// Assert
			expect(result).toBe(42);
			expect(attemptCount).toBe(2);
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

		it("should not resolve services from parent container when recursive is false", () => {
			// Arrange
			parentContainer.register(IServiceA, { useClass: ServiceA });

			// Act & Assert
			expect(() => {
				childContainer.resolve(IServiceA, {
					recursive: false,
				});
			}).toThrow(ResolveException);
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
		clearMiddleware();
	});

	describe("M1: Middleware Execution Order", () => {
		it("should execute middleware in reverse registration order", () => {
			// Arrange
			const executionOrder: number[] = [];
			useMiddleware({
				name: "middleware1",
				executor: (params, next) => {
					executionOrder.push(1);
					return next(params);
				},
			});
			useMiddleware({
				name: "middleware2",
				executor: (params, next) => {
					executionOrder.push(2);
					return next(params);
				},
			});
			useMiddleware({
				name: "middleware3",
				executor: (params, next) => {
					executionOrder.push(3);
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(executionOrder).toEqual([3, 2, 1]);
		});

		it("should preserve LIFO order for middleware supplied in one call", () => {
			// Arrange
			const executionOrder: string[] = [];
			useMiddleware(
				{
					name: "firstVariadicMiddleware",
					executor: (params, next) => {
						executionOrder.push("first");
						return next(params);
					},
				},
				{
					name: "secondVariadicMiddleware",
					executor: (params, next) => {
						executionOrder.push("second");
						return next(params);
					},
				},
			);
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(executionOrder).toEqual(["second", "first"]);
		});
	});

	describe("M2: Middleware Chain", () => {
		it("should reuse a staged lifecycle instance when middleware calls next twice", () => {
			for (const lifecycle of [
				LifecycleEnum.singleton,
				LifecycleEnum.resolution,
			]) {
				// Arrange
				const currentContainer = createContainer(`DoubleNext-${lifecycle}`);
				const IService = createServiceIdentifier<ServiceA>(
					`IDoubleNext-${lifecycle}`,
				);
				let providerCalls = 0;
				let sameNextInstance = false;
				const cleanup = useMiddleware({
					name: `doubleNextMiddleware-${lifecycle}`,
					executor: (params, next) => {
						const firstInstance = next(params);
						const secondInstance = next(params);
						sameNextInstance = firstInstance === secondInstance;
						return firstInstance;
					},
				});
				currentContainer.register(IService, {
					useFactory: () => {
						providerCalls++;
						return new ServiceA();
					},
					lifecycle,
				});

				try {
					// Act
					currentContainer.resolve(IService);

					// Assert
					expect(sameNextInstance).toBe(true);
					expect(providerCalls).toBe(1);
				} finally {
					cleanup();
					currentContainer.dispose();
				}
			}
		});

		it("should isolate staged resolution instances by middleware context", () => {
			// Arrange
			const firstContext: ResolveContext = new Map();
			const secondContext: ResolveContext = new Map();
			let firstInstance: ServiceA | undefined;
			let secondInstance: ServiceA | undefined;
			let providerCalls = 0;
			useMiddleware({
				name: "replaceResolveContextMiddleware",
				executor: (params, next) => {
					firstInstance = next({
						...params,
						resolveContext: firstContext,
					});
					secondInstance = next({
						...params,
						resolveContext: secondContext,
					});
					return firstInstance;
				},
			});
			container.register(IServiceA, {
				useFactory: () => {
					providerCalls++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.resolution,
			});

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(firstInstance).not.toBe(secondInstance);
			expect(providerCalls).toBe(2);
		});

		it("should roll back staged lifecycle commits when a context rejects a value", () => {
			// Arrange
			const firstContext: ResolveContext = new Map();
			const rejectingContext: ResolveContext = new Map();
			const setRejectingContext = rejectingContext.set.bind(rejectingContext);
			rejectingContext.set = (registration, instance) => {
				setRejectingContext(registration, instance);
				throw new Error("context rejected lifecycle value");
			};
			let providerCalls = 0;
			useMiddleware({
				name: "rejectLifecycleCommitMiddleware",
				executor: (params, next) => {
					next({ ...params, resolveContext: firstContext });
					return next({ ...params, resolveContext: rejectingContext });
				},
			});
			container.register(IServiceA, {
				useFactory: () => {
					providerCalls++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.resolution,
			});

			// Act & Assert
			expect(() => container.resolve(IServiceA)).toThrow(
				/context rejected lifecycle value/,
			);
			expect(firstContext.size).toBe(0);
			expect(rejectingContext.size).toBe(0);
			expect(() => container.resolve(IServiceA)).toThrow(
				/context rejected lifecycle value/,
			);
			expect(providerCalls).toBe(4);
		});

		it("should preserve middleware context writes when a later commit fails", () => {
			// Arrange
			const firstContext: ResolveContext = new Map();
			const rejectingContext: ResolveContext = new Map();
			const setRejectingContext = rejectingContext.set.bind(rejectingContext);
			rejectingContext.set = (registration, instance) => {
				setRejectingContext(registration, instance);
				throw new Error("context rejected lifecycle value");
			};
			const middlewareInstance = new ServiceA();
			useMiddleware({
				name: "writeBeforeLifecycleCommitMiddleware",
				executor: (params, next) => {
					next({ ...params, resolveContext: firstContext });
					firstContext.set(params.registration, middlewareInstance);
					return next({ ...params, resolveContext: rejectingContext });
				},
			});
			container.register(IServiceA, {
				useFactory: () => new ServiceA(),
				lifecycle: LifecycleEnum.resolution,
			});

			// Act & Assert
			expect(() => container.resolve(IServiceA)).toThrow(
				/context rejected lifecycle value/,
			);
			expect([...firstContext.values()]).toEqual([middlewareInstance]);
			expect(rejectingContext.size).toBe(0);
		});

		it("should type next as one registration during multiple resolution", () => {
			// Arrange
			const typedMiddleware: ResolveMiddleware<ServiceA, { multiple: true }> = {
				name: "typedMultipleMiddleware",
				executor: (params, next) => {
					const instance = next(params);
					expectTypeOf(instance).toEqualTypeOf<ServiceA>();
					return instance;
				},
			};
			useMiddleware(typedMiddleware);
			container.register(IMultiService, { useClass: ServiceA });
			container.register(IMultiService, { useClass: ServiceA });

			// Act
			const instances = container.resolve(IMultiService, { multiple: true });

			// Assert
			expect(instances).toHaveLength(2);
		});

		it("should preserve undefined returned by optional middleware next", () => {
			// Arrange
			const IOptionalService = createServiceIdentifier<ServiceA | undefined>(
				"IOptionalMiddlewareService",
			);
			const typedMiddleware: ResolveMiddleware<
				ServiceA | undefined,
				{ optional: true }
			> = {
				name: "typedOptionalMiddleware",
				executor: (params, next) => {
					const instance = next(params);
					expectTypeOf(instance).toEqualTypeOf<ServiceA | undefined>();
					return instance;
				},
			};
			useMiddleware(typedMiddleware);
			container.register(IOptionalService, { useFactory: () => undefined });

			// Act
			const instance = container.resolve(IOptionalService, { optional: true });

			// Assert
			expect(instance).toBeUndefined();
		});

		it("should provide resolution params and next to middleware", () => {
			// Arrange
			let receivedParams: unknown;
			let nextCalled = false;
			useMiddleware({
				name: "inspectMiddleware",
				executor: (params, next) => {
					receivedParams = params;
					const result = next(params);
					nextCalled = true;
					return result;
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(receivedParams).toHaveProperty("serviceIdentifier", IServiceA);
			expect(receivedParams).toHaveProperty("container", container);
			expect(nextCalled).toBe(true);
		});
	});

	describe("M3: Single Global Middleware Scope", () => {
		it("should expose no container-level middleware API", () => {
			type ContainerMiddlewareMembers = Extract<
				keyof IContainer,
				"use" | "unused"
			>;

			expectTypeOf<ContainerMiddlewareMembers>().toEqualTypeOf<never>();
			expect(container).not.toHaveProperty("use");
			expect(container).not.toHaveProperty("unused");
		});

		it("should expose use as the only public middleware management operation", () => {
			type RemovedMiddlewareMembers = Extract<
				keyof typeof middleware,
				| "unused"
				| "all"
				| "has"
				| "on"
				| "dispose"
				| "execute"
				| "notifyContainerDispose"
			>;

			expectTypeOf<RemovedMiddlewareMembers>().toEqualTypeOf<never>();
			expect(middleware).not.toHaveProperty("unused");
			expect(middleware).not.toHaveProperty("all");
			expect(middleware).not.toHaveProperty("has");
			expect(middleware).not.toHaveProperty("on");
			expect(middleware).not.toHaveProperty("dispose");
			expect(middleware).not.toHaveProperty("execute");
			expect(middleware).not.toHaveProperty("notifyContainerDispose");
		});

		it("should keep middleware state local to each package module instance", async () => {
			// Arrange
			vi.resetModules();
			const otherCore = await import("../src/index");
			const otherContainer = otherCore.createContainer(
				"OtherModuleMiddlewareContainer",
			);
			let middlewareCalls = 0;
			const cleanup = middleware.use({
				name: "crossModuleMiddleware",
				executor: (params, next) => {
					middlewareCalls++;
					return next(params);
				},
			});
			otherContainer.register(IServiceA, { useClass: ServiceA });

			try {
				// Act
				const instance = otherContainer.resolve(IServiceA);

				// Assert
				expect(otherCore.middleware).not.toBe(middleware);
				expect(instance).toBeInstanceOf(ServiceA);
				expect(middlewareCalls).toBe(0);
			} finally {
				cleanup();
				otherContainer.dispose();
				otherCore.rootContainer.dispose();
			}
		});

		it("should apply the same middleware pipeline to every container", () => {
			// Arrange
			const secondContainer = createContainer("SecondMiddlewareContainer");
			const observedContainers: IContainer[] = [];
			useMiddleware({
				name: "allContainersMiddleware",
				executor: (params, next) => {
					observedContainers.push(params.container);
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });
			secondContainer.register(IServiceA, { useClass: ServiceA });

			try {
				// Act
				container.resolve(IServiceA);
				secondContainer.resolve(IServiceA);

				// Assert
				expect(observedContainers).toEqual([container, secondContainer]);
			} finally {
				secondContainer.dispose();
			}
		});
	});

	describe("M4: Middleware Interception", () => {
		it("should execute middleware for every resolve while reusing a singleton provider", () => {
			// Arrange
			let middlewareCalls = 0;
			let providerCalls = 0;
			useMiddleware({
				name: "singletonMiddleware",
				executor: (params, next) => {
					middlewareCalls++;
					return next(params);
				},
			});
			container.register(IServiceA, {
				useFactory: () => {
					providerCalls++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.singleton,
			});

			// Act
			const firstInstance = container.resolve(IServiceA);
			const secondInstance = container.resolve(IServiceA);

			// Assert
			expect(firstInstance).toBe(secondInstance);
			expect(middlewareCalls).toBe(2);
			expect(providerCalls).toBe(1);
		});

		it("should not cache middleware-transformed singleton results", () => {
			// Arrange
			const IWrappedSingleton = createServiceIdentifier<{
				readonly service: ServiceA;
			}>("IWrappedSingleton");
			let middlewareCalls = 0;
			let providerCalls = 0;
			useMiddleware({
				name: "singletonTransformMiddleware",
				executor: (params, next) => {
					middlewareCalls++;
					return { ...next(params) };
				},
			});
			container.register(IWrappedSingleton, {
				useFactory: () => {
					providerCalls++;
					return { service: new ServiceA() };
				},
				lifecycle: LifecycleEnum.singleton,
			});

			// Act
			const firstInstance = container.resolve(IWrappedSingleton);
			const secondInstance = container.resolve(IWrappedSingleton);

			// Assert
			expect(firstInstance).not.toBe(secondInstance);
			expect(firstInstance.service).toBe(secondInstance.service);
			expect(middlewareCalls).toBe(2);
			expect(providerCalls).toBe(1);
		});

		it("should not cache middleware short-circuit results", () => {
			// Arrange
			const IService = createServiceIdentifier<{ readonly value: number }>(
				"IShortCircuitService",
			);
			let middlewareCalls = 0;
			let providerCalls = 0;
			useMiddleware({
				name: "shortCircuitMiddleware",
				executor: () => ({ value: ++middlewareCalls }),
			});
			container.register(IService, {
				useFactory: () => {
					providerCalls++;
					return { value: 0 };
				},
				lifecycle: LifecycleEnum.singleton,
			});

			// Act
			const firstInstance = container.resolve(IService);
			const secondInstance = container.resolve(IService);

			// Assert
			expect(firstInstance).toEqual({ value: 1 });
			expect(secondInstance).toEqual({ value: 2 });
			expect(providerCalls).toBe(0);
		});

		it("should not commit a new singleton provider when middleware fails", () => {
			// Arrange
			let providerCalls = 0;
			let shouldThrow = true;
			useMiddleware({
				name: "failingSingletonMiddleware",
				executor: (params, next) => {
					const instance = next(params);
					if (shouldThrow) {
						throw new Error("middleware failed");
					}
					return instance;
				},
			});
			container.register(IServiceA, {
				useFactory: () => {
					providerCalls++;
					return new ServiceA();
				},
				lifecycle: LifecycleEnum.singleton,
			});

			// Act & Assert
			expect(() => container.resolve(IServiceA)).toThrow("middleware failed");
			shouldThrow = false;
			expect(container.resolve(IServiceA)).toBeInstanceOf(ServiceA);
			expect(providerCalls).toBe(2);
		});

		it("should allow middleware to inspect, transform, and short-circuit", () => {
			// Arrange
			const mockInstance = new ServiceA();
			const inspectedIdentifiers: unknown[] = [];
			useMiddleware({
				name: "inspectAndTransformMiddleware",
				executor: (params, next) => {
					inspectedIdentifiers.push(params.serviceIdentifier);
					return Object.assign(next(params), { transformed: true });
				},
			});
			useMiddleware({
				name: "selectiveShortCircuitMiddleware",
				executor: (params, next) =>
					params.serviceIdentifier === IServiceB ? mockInstance : next(params),
			});
			container.register(IServiceA, { useClass: ServiceA });
			container.register(IServiceB, { useClass: ServiceB });

			// Act
			const transformed = container.resolve(IServiceA);
			const shortCircuited = container.resolve(IServiceB);

			// Assert
			expect(inspectedIdentifiers).toEqual([IServiceA]);
			expect(
				(transformed as ServiceA & { transformed?: boolean }).transformed,
			).toBe(true);
			expect(shortCircuited).toBe(mockInstance);
		});
	});

	describe("M5: Middleware Cleanup", () => {
		it("should keep at most one active registration for the same object", () => {
			// Arrange
			let middlewareCalls = 0;
			const layer: ResolveMiddleware<ServiceA, { optional?: false }> = {
				name: "identityMiddleware",
				executor: (params, next) => {
					middlewareCalls++;
					return next(params);
				},
			};
			const firstCleanup = useMiddleware(layer);
			const duplicateCleanup = useMiddleware(layer);
			container.register(IServiceA, { useClass: ServiceA });

			// Act & Assert
			container.resolve(IServiceA);
			expect(middlewareCalls).toBe(1);

			duplicateCleanup();
			container.resolve(IServiceA);
			expect(middlewareCalls).toBe(2);

			firstCleanup();
			container.resolve(IServiceA);
			expect(middlewareCalls).toBe(2);
		});

		it("should execute distinct middleware objects that share a name", () => {
			// Arrange
			const executionOrder: string[] = [];
			useMiddleware(
				{
					name: "sharedDiagnosticName",
					executor: (params, next) => {
						executionOrder.push("first");
						return next(params);
					},
				},
				{
					name: "sharedDiagnosticName",
					executor: (params, next) => {
						executionOrder.push("second");
						return next(params);
					},
				},
			);
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			container.resolve(IServiceA);

			// Assert
			expect(executionOrder).toEqual(["second", "first"]);
		});

		it("should remove only middleware registered by the returned cleanup", () => {
			// Arrange
			const executionOrder: string[] = [];
			const firstCleanup = useMiddleware({
				name: "firstCleanupMiddleware",
				executor: (params, next) => {
					executionOrder.push("first");
					return next(params);
				},
			});
			const secondCleanup = useMiddleware({
				name: "secondCleanupMiddleware",
				executor: (params, next) => {
					executionOrder.push("second");
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act & Assert
			firstCleanup();
			container.resolve(IServiceA);
			expect(executionOrder).toEqual(["second"]);

			executionOrder.length = 0;
			secondCleanup();
			container.resolve(IServiceA);
			expect(executionOrder).toEqual([]);
		});

		it("should make cleanup idempotent", () => {
			// Arrange
			let middlewareCalls = 0;
			const cleanup = useMiddleware({
				name: "idempotentCleanupMiddleware",
				executor: (params, next) => {
					middlewareCalls++;
					return next(params);
				},
			});
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			cleanup();
			cleanup();
			container.resolve(IServiceA);

			// Assert
			expect(middlewareCalls).toBe(0);
			expect(() => cleanup()).not.toThrow();
		});

		it("should not let an old cleanup remove a later registration", () => {
			// Arrange
			let middlewareCalls = 0;
			const layer: ResolveMiddleware<ServiceA, { optional?: false }> = {
				name: "reRegisteredMiddleware",
				executor: (params, next) => {
					middlewareCalls++;
					return next(params);
				},
			};
			const oldCleanup = useMiddleware(layer);
			oldCleanup();
			const currentCleanup = useMiddleware(layer);
			container.register(IServiceA, { useClass: ServiceA });

			try {
				// Act
				oldCleanup();
				container.resolve(IServiceA);

				// Assert
				expect(middlewareCalls).toBe(1);
			} finally {
				currentCleanup();
			}
		});
	});

	describe("M6: Middleware Disposal Hook", () => {
		it("should call active middleware for every disposed container", () => {
			// Arrange
			const secondContainer = createContainer("SecondDisposalContainer");
			const disposedContainers: IContainer[] = [];
			useMiddleware({
				name: "disposeMiddleware",
				executor: (params, next) => next(params),
				onContainerDispose: (disposedContainer) => {
					disposedContainers.push(disposedContainer);
				},
			});

			// Act
			container.dispose();
			secondContainer.dispose();

			// Assert
			expect(disposedContainers).toEqual([container, secondContainer]);
		});

		it("should not notify middleware removed before disposal", () => {
			// Arrange
			const onContainerDispose = vi.fn();
			const cleanup = useMiddleware({
				name: "removedDisposeMiddleware",
				executor: (params, next) => next(params),
				onContainerDispose,
			});

			// Act
			cleanup();
			container.dispose();

			// Assert
			expect(onContainerDispose).not.toHaveBeenCalled();
		});

		it("should ignore hook errors and continue notifying active middleware", () => {
			// Arrange
			const successfulHook = vi.fn();
			useMiddleware(
				{
					name: "errorDisposeMiddleware",
					executor: (params, next) => next(params),
					onContainerDispose: () => {
						throw new Error("Disposal error");
					},
				},
				{
					name: "successfulDisposeMiddleware",
					executor: (params, next) => next(params),
					onContainerDispose: successfulHook,
				},
			);

			// Act & Assert
			expect(() => container.dispose()).not.toThrow();
			expect(successfulHook).toHaveBeenCalledWith(container);
		});

		it("should finish the disposal snapshot when a hook calls its cleanup", () => {
			// Arrange
			const laterHook = vi.fn();
			let selfCleanup = () => {};
			selfCleanup = useMiddleware({
				name: "selfCleaningDisposeMiddleware",
				executor: (params, next) => next(params),
				onContainerDispose: () => {
					selfCleanup();
				},
			});
			useMiddleware({
				name: "laterDisposeMiddleware",
				executor: (params, next) => next(params),
				onContainerDispose: laterHook,
			});

			// Act
			container.dispose();

			// Assert
			expect(laterHook).toHaveBeenCalledWith(container);
		});
	});
});

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
			expect(() => container.getServiceIdentifiers()).toThrow(
				/E_CONTAINER_DISPOSED/,
			);
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

		it("should reject functions that cannot be constructed", () => {
			expect(() => {
				container.register(IServiceA, {
					useClass: (() => new ServiceA()) as unknown as typeof ServiceA,
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

		it("should accept an empty string alias target", () => {
			// Arrange
			const target = createServiceIdentifier<ServiceA>("");
			const value = new ServiceA();
			container.register(target, { useValue: value });
			container.register(IAliasTarget, { useAlias: target });

			// Act & Assert
			expect(container.resolve(IAliasTarget)).toBe(value);
		});

		it("should reject invalid useAlias service identifiers", () => {
			expect(() => {
				container.register(IAliasTarget, {
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid service identifier
					useAlias: 42 as any,
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
		it("should reject invalid createServiceIdentifier inputs", () => {
			expect(() => {
				// biome-ignore lint/suspicious/noExplicitAny: testing invalid public input
				createServiceIdentifier(42 as any);
			}).toThrow(/E_INVALID_SERVICE_IDENTIFIER/);
		});

		it("should reject invalid getServiceIdentifierName inputs", () => {
			expect(() => {
				// biome-ignore lint/suspicious/noExplicitAny: testing invalid public input
				getServiceIdentifierName(42 as any);
			}).toThrow(/E_INVALID_SERVICE_IDENTIFIER/);
		});

		it("should reject invalid identifiers at register and resolve boundaries", () => {
			// Arrange
			// biome-ignore lint/suspicious/noExplicitAny: testing invalid public input
			const invalidIdentifier = 42 as any;

			// Act & Assert
			expect(() => {
				container.register(invalidIdentifier, { useValue: new ServiceA() });
			}).toThrow(/E_INVALID_SERVICE_IDENTIFIER/);
			expect(() => container.resolve(invalidIdentifier)).toThrow(
				/E_INVALID_SERVICE_IDENTIFIER/,
			);
		});

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
		it("should treat an undefined defaultValue as omitted", () => {
			// Arrange
			const value = new ServiceA();
			container.register(IServiceA, { useValue: value });

			// Act
			const resolved = container.resolve(IServiceA, {
				defaultValue: undefined,
			});
			const multiple = container.resolve(IUnregisteredService, {
				multiple: true,
				optional: true,
				defaultValue: undefined,
			});

			// Assert
			expect(resolved).toBe(value);
			expect(multiple).toEqual([]);
		});

		it("should keep reusable optional options type-safe without a default", () => {
			// Arrange
			type ReusableOptionalOptions = {
				optional: true;
				defaultValue?: ServiceA | undefined;
			};
			const serviceIdentifier = createServiceIdentifier<ServiceA>(
				"IReusableOptionalService",
			);
			const options: ReusableOptionalOptions = { optional: true };

			// Act
			const instance = container.resolve(serviceIdentifier, options);

			// Assert
			expectTypeOf(instance).toEqualTypeOf<ServiceA | undefined>();
			expect(instance).toBeUndefined();
		});

		it("should validate options when the resolve helper exposes IContainer", () => {
			// Arrange
			const IOptionsProbe = createServiceIdentifier<string[]>(
				"IContainerOptionsProbe",
			);
			const invalidOptions = [
				{ dynamic: true, ref: true },
				{ defaultValue: container },
				{ multiple: true, optional: true, defaultValue: container },
			] as unknown as ResolveOptions<IContainer>[];

			container.register(IOptionsProbe, {
				useFactory: () =>
					invalidOptions.map((options) => {
						try {
							resolve(IContainer, options);
							return "accepted";
						} catch (error) {
							return (error as ResolveException).code;
						}
					}),
			});

			// Act
			const codes = container.resolve(IOptionsProbe);

			// Assert
			expect(codes).toEqual([
				CoreErrorCodeEnum.E_INVALID_OPTIONS,
				CoreErrorCodeEnum.E_INVALID_OPTIONS,
				CoreErrorCodeEnum.E_INVALID_OPTIONS,
			]);
		});

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
				} as unknown as ResolveOptions<ServiceA>);
			}).toThrow(/E_INVALID_OPTIONS/);
		});

		it("should clear resolution state after rejecting invalid options", () => {
			// Arrange
			container.register(IServiceA, { useClass: ServiceA });

			// Act
			try {
				container.resolve(IServiceA, {
					dynamic: true,
					ref: true,
				} as unknown as ResolveOptions<ServiceA>);
			} catch {
				// The invalid options are expected; the assertion covers cleanup.
			}

			// Assert
			expect(() => resolve(IServiceA)).toThrow(/E_RESOLVE_CONTEXT_UNAVAILABLE/);
		});
	});
});
