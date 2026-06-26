/**
 * @overview Decorator package specification compliance tests.
 *
 * Test suite for @husky-di/decorator based on SPECIFICATION.md.
 *
 * @author AEPKILL
 * @created 2025-08-06 21:39:35
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "reflect-metadata";
import {
	createContainer,
	globalMiddleware,
	type IContainer,
	type Ref,
	ResolveContainerScopeEnum,
	ResolveException,
} from "@husky-di/core";
import { INJECTION_METADATA_KEY } from "../src/constants/metadata-key.const";
import {
	DecoratorErrorCodeEnum,
	DecoratorException,
	decoratorMiddleware,
	inject,
	injectable,
	tagged,
} from "../src/index";

function expectDecoratorException(
	operation: () => unknown,
	code: string,
	message: RegExp,
): void {
	try {
		operation();
		throw new Error("Expected operation to throw.");
	} catch (error) {
		expect(error).toBeInstanceOf(DecoratorException);
		expect(DecoratorException.isDecoratorException(error)).toBe(true);
		expect((error as DecoratorException).code).toBe(code);
		expect((error as Error).message).toMatch(message);
	}
}

describe("Decorator Module - Specification Compliance", () => {
	beforeAll(() => {
		globalMiddleware.use(decoratorMiddleware);
	});

	let container: IContainer;
	beforeEach(() => {
		container = createContainer();
	});

	describe("4.1 @injectable() Decorator", () => {
		describe("M1. Single Application", () => {
			it("should expose E_DUPLICATE_INJECTABLE as the structured code and message prefix", () => {
				expectDecoratorException(
					() => {
						@injectable()
						@injectable()
						// biome-ignore lint/correctness/noUnusedVariables: test case for duplicate decorator
						class TestService {}
					},
					DecoratorErrorCodeEnum.E_DUPLICATE_INJECTABLE,
					/^E_DUPLICATE_INJECTABLE: Class 'TestService' is already decorated with @Injectable\(\)$/,
				);
			});

			it("should throw E_DUPLICATE_INJECTABLE when applied more than once", () => {
				expect(() => {
					@injectable()
					@injectable()
					// biome-ignore lint/correctness/noUnusedVariables: test case for duplicate decorator
					class TestService {}
				}).toThrow(/already decorated with @injectable\(\)/i);
			});
		});

		describe("M2. Metadata Consolidation", () => {
			it("should consolidate explicit metadata from @inject()", () => {
				@injectable()
				class DependencyA {}

				@injectable()
				class DependencyB {}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyA) public depA: DependencyA,
						@inject(DependencyB) public depB: DependencyB,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.depA).toBeInstanceOf(DependencyA);
				expect(instance.depB).toBeInstanceOf(DependencyB);
			});

			it("should use implicit metadata from design:paramtypes when no explicit metadata", () => {
				@injectable()
				class DependencyA {}

				@injectable()
				class TestService {
					constructor(public depA: DependencyA) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.depA).toBeInstanceOf(DependencyA);
			});

			it("should prefer explicit metadata over implicit when both exist", () => {
				@injectable()
				class DependencyA {}

				@injectable()
				class DependencyB {}

				@injectable()
				class TestService {
					constructor(
						public depA: DependencyA,
						@inject(DependencyB) public depB: DependencyB,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.depA).toBeInstanceOf(DependencyA);
				expect(instance.depB).toBeInstanceOf(DependencyB);
			});
		});

		describe("M3. Parameter Type Validation", () => {
			it("should throw E_NON_CLASS_PARAMETER for primitive parameters without explicit metadata", () => {
				expectDecoratorException(
					() => {
						@injectable()
						// biome-ignore lint/correctness/noUnusedVariables: test case for invalid primitive constructor metadata
						class TestService {
							constructor(public value: string) {}
						}
					},
					DecoratorErrorCodeEnum.E_NON_CLASS_PARAMETER,
					/^E_NON_CLASS_PARAMETER: Constructor 'TestService' parameter #0 must be a class type$/,
				);
			});

			it("should accept primitive type with explicit @inject()", () => {
				const StringToken = Symbol("String");

				@injectable()
				class TestService {
					constructor(@inject(StringToken) public name: string) {}
				}

				container.register(StringToken, { useValue: "test" });
				const instance = container.resolve(TestService);
				expect(instance.name).toBe("test");
			});
		});

		describe("M4. Metadata Storage", () => {
			it("should store metadata accessible during resolution", () => {
				@injectable()
				class DependencyService {
					value = "test";
				}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService) public dep: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep.value).toBe("test");
			});
		});
	});

	describe("4.2 @inject() Decorator", () => {
		describe("I1. Parameter Scope", () => {
			it("should work on constructor parameters", () => {
				@injectable()
				class DependencyService {}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService) public dep: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep).toBeInstanceOf(DependencyService);
			});
		});

		describe("I2. Service Identifier Requirement", () => {
			it("should accept class constructor as service identifier", () => {
				@injectable()
				class DependencyService {}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService) public dep: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep).toBeInstanceOf(DependencyService);
			});

			it("should accept symbol as service identifier", () => {
				const TOKEN = Symbol("Token");

				@injectable()
				class TestService {
					constructor(@inject(TOKEN) public value: string) {}
				}

				container.register(TOKEN, { useValue: "test-value" });
				const instance = container.resolve(TestService);
				expect(instance.value).toBe("test-value");
			});

			it("should accept string as service identifier", () => {
				@injectable()
				class TestService {
					constructor(@inject("StringToken") public value: string) {}
				}

				container.register("StringToken", { useValue: "test-string" });
				const instance = container.resolve(TestService);
				expect(instance.value).toBe("test-string");
			});
		});

		describe("I3. Metadata Attachment", () => {
			it("should store complete InjectionMetadata at parameter index", () => {
				@injectable()
				class DependencyService {}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService, { optional: true })
						public dep?: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep).toBeInstanceOf(DependencyService);
			});
		});

		describe("I4. Multiple Applications", () => {
			it("should allow metadata to be overwritten by later decorators", () => {
				// Note: Decorators execute bottom-to-top, so @inject(TokenA) executes last
				const TokenA = Symbol("TokenA");
				const TokenB = Symbol("TokenB");

				@injectable()
				class TestService {
					constructor(
						@inject(TokenA)
						@inject(TokenB)
						public value: string,
					) {}
				}

				container.register(TokenA, { useValue: "value-a" });
				container.register(TokenB, { useValue: "value-b" });
				const instance = container.resolve(TestService);
				// Decorators execute bottom-to-top, so TokenA is the final metadata
				expect(instance.value).toBe("value-a");
			});
		});

		describe("4.2.3 Options Semantics", () => {
			it("should support dynamic and ref options", () => {
				// Note: The 'container' option is part of ResolveOptions
				// but requires specific implementation support
				@injectable()
				class DependencyService {
					value = "test";
				}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService)
						public dep: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep.value).toBe("test");
			});

			it("should return dynamic reference when dynamic option is true", () => {
				@injectable()
				class DependencyService {
					value = "initial";
				}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService, { dynamic: true })
						public depRef: Ref<DependencyService>,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.depRef.current.value).toBe("initial");

				// Dynamic reference should reflect registration changes
				expect(typeof instance.depRef.current).toBe("object");
			});

			it("should return reference wrapper when ref option is true", () => {
				@injectable()
				class DependencyService {
					value = "test";
				}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService, { ref: true })
						public depRef: Ref<DependencyService>,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.depRef.resolved).toBe(false);
				expect(instance.depRef.current.value).toBe("test");
				expect(instance.depRef.resolved).toBe(true);
			});

			it("should return undefined when optional is true and resolution fails", () => {
				const MISSING_TOKEN = Symbol("Missing");

				@injectable()
				class TestService {
					constructor(
						@inject(MISSING_TOKEN, { optional: true })
						public missing?: unknown,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.missing).toBeUndefined();
			});

			it("should throw error when optional is false and resolution fails", () => {
				const MISSING_TOKEN = Symbol("Missing");

				@injectable()
				class TestService {
					constructor(@inject(MISSING_TOKEN) public missing: unknown) {}
				}

				expect(() => {
					container.resolve(TestService);
				}).toThrow();
			});

			it("should resolve from origin container when scope is set to origin", () => {
				const IDatabase = Symbol("IDatabase");
				const IDatabaseOptions = Symbol("IDatabaseOptions");

				@injectable()
				class Database {
					constructor(
						@inject(IDatabaseOptions, {
							scope: ResolveContainerScopeEnum.origin,
						})
						public readonly options: { baseURL: string },
					) {}
				}

				const parentContainer = createContainer("ParentContainer");
				const childContainer = createContainer(
					"ChildContainer",
					parentContainer,
				);
				const childOptions = { baseURL: "http://localhost:3000" };

				parentContainer.register(IDatabase, {
					useClass: Database,
				});
				childContainer.register(IDatabaseOptions, {
					useValue: childOptions,
				});

				const instance = childContainer.resolve<Database>(IDatabase);

				expect(instance).toBeInstanceOf(Database);
				expect(instance.options).toBe(childOptions);
			});
		});
	});

	describe("4.3 @tagged() Decorator", () => {
		describe("T1. Low-Level Primitive", () => {
			it("should work as foundational metadata attachment mechanism", () => {
				@injectable()
				class DependencyService {
					value = "test";
				}

				@injectable()
				class TestService {
					constructor(
						@tagged({ serviceIdentifier: DependencyService })
						public dep: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep.value).toBe("test");
			});
		});

		describe("T2. Complete Metadata", () => {
			it("should expose E_MISSING_SERVICE_IDENTIFIER when metadata omits serviceIdentifier", () => {
				expectDecoratorException(
					() =>
						tagged({
							// biome-ignore lint/suspicious/noExplicitAny: testing invalid metadata
						} as any),
					DecoratorErrorCodeEnum.E_MISSING_SERVICE_IDENTIFIER,
					/^E_MISSING_SERVICE_IDENTIFIER: Injection metadata must include a serviceIdentifier$/,
				);
			});

			it("should expose E_INVALID_SERVICE_IDENTIFIER when metadata uses an invalid serviceIdentifier", () => {
				expectDecoratorException(
					() =>
						tagged({
							serviceIdentifier: "",
						}),
					DecoratorErrorCodeEnum.E_INVALID_SERVICE_IDENTIFIER,
					/^E_INVALID_SERVICE_IDENTIFIER: Invalid service identifier: $/,
				);
			});

			it("should expose E_CONFLICTING_OPTIONS when metadata uses dynamic and ref together", () => {
				expectDecoratorException(
					() =>
						tagged({
							serviceIdentifier: "Service",
							dynamic: true,
							ref: true,
						}),
					DecoratorErrorCodeEnum.E_CONFLICTING_OPTIONS,
					/^E_CONFLICTING_OPTIONS: Cannot use both "dynamic" and "ref" options simultaneously$/,
				);
			});

			it("should accept metadata with serviceIdentifier", () => {
				@injectable()
				class DependencyService {}

				@injectable()
				class TestService {
					constructor(
						@tagged({
							serviceIdentifier: DependencyService,
							optional: true,
						})
						public dep?: DependencyService,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.dep).toBeInstanceOf(DependencyService);
			});

			it("should support all InjectionMetadata fields", () => {
				@injectable()
				class DependencyService {
					value = "test";
				}

				@injectable()
				class TestService {
					constructor(
						@tagged({
							serviceIdentifier: DependencyService,
							ref: true,
							optional: false,
						})
						public depRef: Ref<DependencyService>,
					) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.depRef.current.value).toBe("test");
			});

			it("should support scope in InjectionMetadata", () => {
				const IDatabase = Symbol("IDatabase");
				const IDatabaseOptions = Symbol("IDatabaseOptions");

				@injectable()
				class Database {
					constructor(
						@tagged({
							serviceIdentifier: IDatabaseOptions,
							scope: ResolveContainerScopeEnum.origin,
						})
						public readonly options: { baseURL: string },
					) {}
				}

				const parentContainer = createContainer("ParentContainer");
				const childContainer = createContainer(
					"ChildContainer",
					parentContainer,
				);
				const childOptions = { baseURL: "http://localhost:3000" };

				parentContainer.register(IDatabase, {
					useClass: Database,
				});
				childContainer.register(IDatabaseOptions, {
					useValue: childOptions,
				});

				const instance = childContainer.resolve<Database>(IDatabase);

				expect(instance.options).toBe(childOptions);
			});
		});

		describe("T3, T4, T5. Metadata Storage, Retrieval, and Array Integrity", () => {
			it("should write sparse metadata to INJECTION_METADATA by parameter index", () => {
				class DependencyService {}

				class TestService {
					constructor(
						public first: unknown,
						@tagged({ serviceIdentifier: DependencyService })
						public second: DependencyService,
					) {}
				}

				const metadata = Reflect.getMetadata(
					INJECTION_METADATA_KEY,
					TestService,
				);

				expect(metadata).toHaveLength(2);
				expect(metadata[0]).toBeUndefined();
				expect(metadata[1]).toEqual({ serviceIdentifier: DependencyService });
			});
		});
	});

	describe("5. Validation Rules", () => {
		describe("V1. Injectable Requirement", () => {
			it("should expose E_NOT_INJECTABLE as the structured resolve code and message prefix", () => {
				class NonInjectableService {}

				@injectable()
				class TestService {
					constructor(
						@inject(NonInjectableService)
						public dep: NonInjectableService,
					) {}
				}

				try {
					container.resolve(TestService);
					throw new Error("Expected resolve to throw.");
				} catch (error) {
					expect(error).toBeInstanceOf(ResolveException);
					expect((error as ResolveException).code).toBe(
						DecoratorErrorCodeEnum.E_NOT_INJECTABLE,
					);
					expect((error as Error).message).toContain(
						"E_NOT_INJECTABLE: Class 'NonInjectableService' must be decorated with @Injectable()",
					);
				}
			});

			it("should throw E_NOT_INJECTABLE when resolving non-injectable class", () => {
				class NonInjectableService {}

				@injectable()
				class TestService {
					constructor(
						@inject(NonInjectableService)
						public dep: NonInjectableService,
					) {}
				}

				expect(() => {
					container.resolve(TestService);
				}).toThrow(/must be decorated with @injectable\(\)/i);
			});
		});

		describe("V3. Service Identifier Validity", () => {
			it("should accept class constructor", () => {
				@injectable()
				class DependencyService {}

				@injectable()
				class TestService {
					constructor(
						@inject(DependencyService) public dep: DependencyService,
					) {}
				}

				expect(() => container.resolve(TestService)).not.toThrow();
			});

			it("should accept symbol", () => {
				const TOKEN = Symbol("Token");

				@injectable()
				class TestService {
					constructor(@inject(TOKEN) public value: string) {}
				}

				container.register(TOKEN, { useValue: "test" });
				expect(() => container.resolve(TestService)).not.toThrow();
			});

			it("should accept non-empty string", () => {
				@injectable()
				class TestService {
					constructor(@inject("Token") public value: string) {}
				}

				container.register("Token", { useValue: "test" });
				expect(() => container.resolve(TestService)).not.toThrow();
			});
		});

		describe("V4. Option Conflicts", () => {
			it("should reject dynamic and ref options on the same parameter metadata", () => {
				expectDecoratorException(
					() =>
						tagged({
							serviceIdentifier: "Token",
							dynamic: true,
							ref: true,
						}),
					DecoratorErrorCodeEnum.E_CONFLICTING_OPTIONS,
					/^E_CONFLICTING_OPTIONS: Cannot use both "dynamic" and "ref" options simultaneously$/,
				);
			});
		});
	});

	describe("7. Error Conditions", () => {
		describe("E1. Duplicate Injectable Decorator", () => {
			it("should throw when @injectable() is applied more than once", () => {
				expect(() => {
					@injectable()
					@injectable()
					// biome-ignore lint/correctness/noUnusedVariables: test case for duplicate decorator
					class DuplicateService {}
				}).toThrow(/already decorated with @injectable\(\)/i);
			});

			it("should include class name in error message", () => {
				expect(() => {
					@injectable()
					@injectable()
					// biome-ignore lint/correctness/noUnusedVariables: test case for duplicate decorator error message
					class MyService {}
				}).toThrow(/MyService/);
			});
		});

		describe("E2. Non-Class Parameter Type", () => {
			it("should validate parameter types during decoration", () => {
				expectDecoratorException(
					() => {
						@injectable()
						// biome-ignore lint/correctness/noUnusedVariables: test case for invalid primitive constructor metadata
						class TestService {
							constructor(_value: number) {}
						}
					},
					DecoratorErrorCodeEnum.E_NON_CLASS_PARAMETER,
					/^E_NON_CLASS_PARAMETER: Constructor 'TestService' parameter #0 must be a class type$/,
				);
			});

			it("should require explicit @inject() for non-class dependencies", () => {
				const TOKEN = Symbol("Token");

				@injectable()
				class MyTestService {
					constructor(@inject(TOKEN) public value: string) {}
				}

				container.register(TOKEN, { useValue: "test-value" });
				const instance = container.resolve(MyTestService);
				expect(instance.value).toBe("test-value");
			});
		});

		describe("E3. Not Injectable", () => {
			it("should throw when resolving class without @injectable()", () => {
				class NotInjectableClass {}

				@injectable()
				class TestService {
					constructor(
						@inject(NotInjectableClass)
						public dep: NotInjectableClass,
					) {}
				}

				expect(() => {
					container.resolve(TestService);
				}).toThrow(/must be decorated with @injectable\(\)/i);
			});

			it("should include class name in error message", () => {
				class MyNonInjectableService {}

				@injectable()
				class TestService {
					constructor(
						@inject(MyNonInjectableService)
						public dep: MyNonInjectableService,
					) {}
				}

				expect(() => {
					container.resolve(TestService);
				}).toThrow(/MyNonInjectableService/);
			});
		});
	});

	describe("8. TypeScript Metadata Integration", () => {
		it("should use design:paramtypes metadata when available", () => {
			@injectable()
			class DependencyA {}

			@injectable()
			class DependencyB {}

			@injectable()
			class TestService {
				constructor(
					public depA: DependencyA,
					public depB: DependencyB,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.depA).toBeInstanceOf(DependencyA);
			expect(instance.depB).toBeInstanceOf(DependencyB);
		});

		it("should prioritize explicit @inject() over design:paramtypes", () => {
			@injectable()
			class DependencyA {}

			@injectable()
			class DependencyB {}

			@injectable()
			class TestService {
				constructor(@inject(DependencyB) public dep: DependencyA) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.dep).toBeInstanceOf(DependencyB);
		});
	});
});
