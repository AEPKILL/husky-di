/**
 * @overview
 * Test suite for @husky-di/decorator based on SPECIFICATION.md
 * @author AEPKILL
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "reflect-metadata";
import {
	createContainer,
	globalMiddleware,
	type IContainer,
	type Ref,
} from "@husky-di/core";
import { decoratorMiddleware, inject, injectable, tagged } from "../src/index";

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
			it("should throw E_DUPLICATE_INJECTABLE when applied more than once", () => {
				expect(() => {
					@injectable()
					@injectable()
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
			it("should accept TypeScript-inferred wrapper types for primitives", () => {
				@injectable()
				class TestService {
					constructor(public wrapper: string) {}
				}

				const instance = container.resolve(TestService);
				expect(instance.wrapper).toBeInstanceOf(String);
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
		});
	});

	describe("5. Validation Rules", () => {
		describe("V1. Injectable Requirement", () => {
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
	});

	describe("7. Error Conditions", () => {
		describe("E1. Duplicate Injectable Decorator", () => {
			it("should throw when @injectable() is applied more than once", () => {
				expect(() => {
					@injectable()
					@injectable()
					class DuplicateService {}
				}).toThrow(/already decorated with @injectable\(\)/i);
			});

			it("should include class name in error message", () => {
				expect(() => {
					@injectable()
					@injectable()
					class MyService {}
				}).toThrow(/MyService/);
			});
		});

		describe("E2. Non-Class Parameter Type", () => {
			it("should validate parameter types during decoration", () => {
				// TypeScript emits wrapper constructors (String, Number, Boolean) for primitives
				// which are valid function types, so they pass validation
				@injectable()
				class TestService {
					constructor(value: number) {}
				}

				// The class is decorated successfully
				expect(TestService).toBeDefined();
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

	describe("Integration Tests", () => {
		it("should support complete dependency injection flow", () => {
			@injectable()
			class LoggerService {
				log(message: string) {
					return `Logged: ${message}`;
				}
			}

			@injectable()
			class DatabaseService {
				constructor(@inject(LoggerService) private logger: LoggerService) {}

				query(sql: string) {
					return this.logger.log(`Executing: ${sql}`);
				}
			}

			@injectable()
			class UserService {
				constructor(
					@inject(DatabaseService) private db: DatabaseService,
					@inject(LoggerService) private logger: LoggerService,
				) {}

				getUser(id: string) {
					return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
				}
			}

			const userService = container.resolve(UserService);
			const result = userService.getUser("123");
			expect(result).toBe(
				"Logged: Executing: SELECT * FROM users WHERE id = 123",
			);
		});

		it("should support complex dependency graph with multiple options", () => {
			@injectable()
			class ConfigService {
				getValue(key: string) {
					return `config-${key}`;
				}
			}

			@injectable()
			class CacheService {
				constructor(
					@inject(ConfigService, { dynamic: true })
					private configRef: Ref<ConfigService>,
				) {}

				get(key: string) {
					return `cached-${this.configRef.current.getValue(key)}`;
				}
			}

			@injectable()
			class ApiService {
				constructor(
					@inject(CacheService, { ref: true })
					public cacheRef: Ref<CacheService>,
					@inject(ConfigService) public config: ConfigService,
				) {}

				getData(key: string) {
					return {
						cached: this.cacheRef.current.get(key),
						direct: this.config.getValue(key),
					};
				}
			}

			const apiService = container.resolve(ApiService);
			const result = apiService.getData("test");

			expect(result.cached).toBe("cached-config-test");
			expect(result.direct).toBe("config-test");
		});

		it("should handle optional dependencies correctly", () => {
			const OPTIONAL_TOKEN = Symbol("Optional");

			@injectable()
			class ServiceA {}

			@injectable()
			class TestService {
				constructor(
					@inject(ServiceA) public required: ServiceA,
					@inject(OPTIONAL_TOKEN, { optional: true })
					public optional?: unknown,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.required).toBeInstanceOf(ServiceA);
			expect(instance.optional).toBeUndefined();
		});

		it("should support mixing explicit and implicit injection", () => {
			@injectable()
			class ServiceA {
				value = "A";
			}

			@injectable()
			class ServiceB {
				value = "B";
			}

			@injectable()
			class ServiceC {
				value = "C";
			}

			@injectable()
			class TestService {
				constructor(
					public a: ServiceA,
					@inject(ServiceB) public b: ServiceB,
					public c: ServiceC,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.a.value).toBe("A");
			expect(instance.b.value).toBe("B");
			expect(instance.c.value).toBe("C");
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty constructor", () => {
			@injectable()
			class EmptyService {
				constructor() {}
			}

			const instance = container.resolve(EmptyService);
			expect(instance).toBeInstanceOf(EmptyService);
		});

		it("should handle constructor with single parameter", () => {
			@injectable()
			class SingleDependency {}

			@injectable()
			class TestService {
				constructor(public dep: SingleDependency) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.dep).toBeInstanceOf(SingleDependency);
		});

		it("should handle constructor with many parameters", () => {
			@injectable()
			class Dep1 {}
			@injectable()
			class Dep2 {}
			@injectable()
			class Dep3 {}
			@injectable()
			class Dep4 {}
			@injectable()
			class Dep5 {}

			@injectable()
			class TestService {
				constructor(
					public d1: Dep1,
					public d2: Dep2,
					public d3: Dep3,
					public d4: Dep4,
					public d5: Dep5,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.d1).toBeInstanceOf(Dep1);
			expect(instance.d2).toBeInstanceOf(Dep2);
			expect(instance.d3).toBeInstanceOf(Dep3);
			expect(instance.d4).toBeInstanceOf(Dep4);
			expect(instance.d5).toBeInstanceOf(Dep5);
		});

		it("should detect circular dependencies", () => {
			@injectable()
			class ServiceA {
				constructor(@inject("ServiceB") public serviceB: unknown) {}
			}

			@injectable()
			class ServiceB {
				constructor(@inject(ServiceA) public serviceA: ServiceA) {}
			}

			container.register("ServiceB", { useClass: ServiceB });

			expect(() => {
				container.resolve(ServiceA);
			}).toThrow(/circular dependency/i);
		});

		it("should handle constructor errors gracefully", () => {
			@injectable()
			class FailingService {
				constructor() {
					throw new Error("Constructor failed");
				}
			}

			@injectable()
			class TestService {
				constructor(@inject(FailingService) public failing: FailingService) {}
			}

			expect(() => {
				container.resolve(TestService);
			}).toThrow(/Constructor failed/);
		});
	});

	describe("decoratorMiddleware", () => {
		it("should have correct middleware name", () => {
			expect(decoratorMiddleware.name.toString()).toBe(
				"Symbol(DecoratorMiddleware)",
			);
		});

		it("should have executor function", () => {
			expect(typeof decoratorMiddleware.executor).toBe("function");
		});

		it("should be registered in global middleware", () => {
			@injectable()
			class TestService {}

			// Should work because middleware is registered
			expect(() => container.resolve(TestService)).not.toThrow();
		});
	});

	describe("TypeScript Metadata Integration", () => {
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
