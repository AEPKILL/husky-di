import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "reflect-metadata";
import {
	createContainer,
	globalMiddleware,
	type IContainer,
	type Ref,
} from "@husky-di/core";
import { decoratorMiddleware, inject, injectable } from "../src/index";

describe("Decorator Module", () => {
	beforeAll(() => {
		globalMiddleware.use(decoratorMiddleware);
	});
	let container: IContainer;
	beforeEach(() => {
		container = createContainer();
	});

	describe("@injectable()", () => {
		it("should correctly mark class as injectable", () => {
			@injectable()
			class TestService {
				constructor() {}
			}
			expect(container.resolve(TestService)).toBeDefined();
		});

		it("should handle constructor with parameters", () => {
			@injectable()
			class DependencyService {}

			@injectable()
			class TestService {
				constructor(@inject(DependencyService) dep: DependencyService) {}
			}

			container.register(TestService, {
				useClass: TestService,
			});

			expect(container.resolve(TestService)).toBeDefined();
		});

		it("should inject class without @inject()", () => {
			@injectable()
			class A {}
			@injectable()
			class B {
				constructor(public a: A) {}
			}

			expect(container.resolve(B)).toBeDefined();
			expect(container.resolve(B).a).toBeDefined();
			expect(container.resolve(B).a).toBeInstanceOf(A);
		});

		it("should handle multiple dependency injection", () => {
			@injectable()
			class ServiceA {}
			@injectable()
			class ServiceB {}
			@injectable()
			class ServiceC {}

			@injectable()
			class TestService {
				constructor(
					@inject(ServiceA) public a: ServiceA,
					@inject(ServiceB) public b: ServiceB,
					@inject(ServiceC) public c: ServiceC,
				) {}
			}

			const instance = container.resolve(TestService);

			expect(instance.a).toBeDefined();
			expect(instance.b).toBeDefined();
			expect(instance.c).toBeDefined();
		});
	});

	describe("@inject() with options", () => {
		it("should support dynamic injection", () => {
			@injectable()
			class DependencyService {
				value = "dependency";
			}

			@injectable()
			class TestService {
				constructor(
					@inject(DependencyService, { dynamic: true })
					public dep: Ref<DependencyService>,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.dep).toBeDefined();
			expect(instance.dep.current.value).toBe("dependency");
		});

		it("should support ref injection options", () => {
			@injectable()
			class DependencyService {
				value = "dependency";
			}

			@injectable()
			class TestService {
				constructor(
					@inject(DependencyService, { ref: true })
					public depRef: Ref<DependencyService>,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.depRef).toBeDefined();
			expect(instance.depRef.resolved).toBe(false);
			expect(instance.depRef.current.value).toBe("dependency");
			expect(instance.depRef.resolved).toBe(true);
		});

		it("should support optional injection with default value", () => {
			@injectable()
			class ExistingService {
				value = "existing";
			}

			@injectable()
			class TestService {
				constructor(
					@inject(ExistingService, {
						optional: true,
					})
					public service: ExistingService,
				) {}
			}

			const instance = container.resolve(TestService);
			expect(instance.service).toBeDefined();
			expect(instance.service.value).toBe("existing");
		});

		it("should support dynamic injection options", () => {
			@injectable()
			class ConfigService {
				getValue(key: string) {
					return `config-${key}`;
				}
			}

			@injectable()
			class TestService {
				constructor(
					@inject(ConfigService, { dynamic: true })
					public configRef: Ref<ConfigService>,
				) {}

				getConfigValue(key: string) {
					return this.configRef.current.getValue(key);
				}
			}

			const instance = container.resolve(TestService);
			expect(instance.configRef).toBeDefined();
			expect(instance.getConfigValue("test")).toBe("config-test");
		});
	});

	describe("Integration tests", () => {
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

		it("should support complex dependency graph with options", () => {
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
					const config = this.configRef.current;
					return `cached-${config.getValue(key)}`;
				}
			}

			@injectable()
			class ApiService {
				constructor(
					@inject(CacheService, { ref: true })
					public cacheRef: Ref<CacheService>,
					@inject(ConfigService)
					public config: ConfigService,
				) {}

				getData(key: string) {
					const cache = this.cacheRef.current;
					return {
						cached: cache.get(key),
						direct: this.config.getValue(key),
					};
				}
			}

			const apiService = container.resolve(ApiService);

			// Verify the structure before calling methods
			expect(apiService.cacheRef).toBeDefined();
			expect(typeof apiService.cacheRef).toBe("object");

			const result = apiService.getData("test");

			expect(result.cached).toBe("cached-config-test");
			expect(result.direct).toBe("config-test");
		});
	});

	describe("Error handling", () => {
		it("should handle injection of non-injectable dependency", () => {
			// 定义一个没有使用 @injectable() 装饰器的类
			class NonInjectableService {
				constructor(public value: string = "non-injectable") {}
			}

			@injectable()
			class TestService {
				constructor(
					@inject(NonInjectableService)
					public dependency: NonInjectableService,
				) {}
			}

			// 尝试解析时应该抛出错误，因为 NonInjectableService 没有注入元数据
			expect(() => {
				container.resolve(TestService);
			}).toThrow("The class NonInjectableService has no injection metadata.");
		});

		it("should handle circular dependency detection", () => {
			@injectable()
			class ServiceA {
				constructor(@inject("ServiceB") public serviceB: unknown) {}
			}

			@injectable()
			class ServiceB {
				constructor(@inject(ServiceA) public serviceA: ServiceA) {}
			}

			// 注册服务
			container.register("ServiceB", { useClass: ServiceB });

			// 循环依赖应该被检测到并抛出错误
			expect(() => {
				container.resolve(ServiceA);
			}).toThrow(
				'Circular dependency detected for service identifier "ServiceA". To resolve this, use either the "ref" option to get a reference to the service or the "dynamic" option to defer resolution until the service is actually used.',
			);
		});

		it("should handle constructor error during instantiation", () => {
			@injectable()
			class FailingService {
				constructor() {
					throw new Error("Service initialization failed");
				}
			}

			@injectable()
			class TestService {
				constructor(@inject(FailingService) public failing: FailingService) {}
			}

			// 依赖实例化失败应该传播错误
			expect(() => {
				container.resolve(TestService);
			}).toThrow(
				/Failed to resolve service identifier "FailingService" in "DefaultContainer#CONTAINER-\d+": Service initialization failed/,
			);
		});

		it("should handle missing required dependency", () => {
			// 定义一个不存在的服务标识符
			const MISSING_SERVICE = Symbol("MissingService");

			@injectable()
			class TestService {
				constructor(
					@inject(MISSING_SERVICE)
					public missing: null,
				) {}
			}

			// 尝试注入不存在的服务应该抛出错误
			expect(() => {
				container.resolve(TestService);
			}).toThrow();
		});

		it("should handle invalid service identifier in inject decorator", () => {
			expect(() => {
				@injectable()
				class TestService {
					constructor(
						@inject("null")
						public invalid: null,
					) {}
				}

				container.resolve(TestService);
			}).toThrow(
				'Service identifier "null" is not registered in this container',
			);
		});
	});

	describe("decoratorMiddleware", () => {
		it("should have correct middleware name", () => {
			expect(decoratorMiddleware.name.toString()).toBe(
				"Symbol(DecoratorMiddleware)",
			);
		});

		it("should export middleware with executor function", () => {
			expect(typeof decoratorMiddleware.executor).toBe("function");
		});
	});
});
