import { createServiceIdentifier, resolve } from "@husky-di/core";
import { describe, expect, it } from "vitest";
import { createModule } from "../src/index";
import type { IInternalModule } from "../src/interfaces/module.interface";
import { ModuleBuilder } from "../src/utils/module.utils";

// 创建可变的模块接口用于测试
interface MutableTestModule extends Omit<IInternalModule, "imports"> {
	imports?: Array<IInternalModule>;
}

interface IDatabaseConfig {
	type: string;
	host: string;
	port: number;
	username: string;
	password: string;
}
const IDatabaseConfig =
	createServiceIdentifier<IDatabaseConfig>("IDatabaseConfig");

interface IUser {
	readonly name: string;
	getUser(): { id: number; name: string };
}
const IUser = createServiceIdentifier<IUser>("IUser");

interface IDatabase {
	readonly config: IDatabaseConfig;
	connect(): string;
}
const IDatabase = createServiceIdentifier<IDatabase>("IDatabase");

interface IAuthService {
	authenticate(): { authenticated: boolean; token: string };
}
const IAuthService = createServiceIdentifier<IAuthService>("IAuthService");

interface IApp {
	readonly userService: IUser;
	readonly databaseService: IDatabase;
	readonly authService: IAuthService;
	bootstrap(): string;
}
const IApp = createServiceIdentifier<IApp>("IApp");

// 测试用的服务类
class UserService implements IUser {
	public name = "UserService";
	public getUser() {
		return { id: 1, name: "test user" };
	}
}

class DatabaseService implements IDatabase {
	readonly config = resolve(IDatabaseConfig);
	public connect() {
		return `Connected to ${this.config.type} at ${this.config.host}:${this.config.port}`;
	}
}

class AuthService implements IAuthService {
	public authenticate() {
		return { authenticated: true, token: "test-token" };
	}
}

class AppService implements IApp {
	public readonly userService = resolve(IUser);
	public readonly databaseService = resolve(IDatabase);
	public readonly authService = resolve(IAuthService);

	public bootstrap() {
		return "Application bootstrapped successfully";
	}
}

describe("Module System", () => {
	it("should not import duplicate module", () => {
		const a = createModule({ name: "A" });

		expect(() =>
			createModule({
				name: "test",
				imports: [a, a],
			}),
		).toThrow(/Duplicate import module: "A#MODULE-\d+" in "test#MODULE-\d+"./);
	});

	it("should can export service identifier", () => {
		expect(() =>
			createModule({
				name: "TestModule",
				declarations: [
					{
						serviceIdentifier: "a",
						useValue: "a",
					},
				],
				exports: ["a"],
			}),
		).not.toThrow();

		expect(() => {
			const FooModule = createModule({
				name: "FooModule",
				declarations: [
					{
						serviceIdentifier: "a",
						useValue: "a",
					},
				],
				exports: ["a"],
			});
			createModule({
				name: "TestModule",
				imports: [FooModule],
				exports: ["a"],
			});
		}).not.toThrow();
	});

	it("should not export undeclared service identifier", () => {
		expect(() =>
			createModule({
				name: "TestModule",
				exports: ["b"],
			}),
		).toThrow(
			/Cannot export service identifier "b" from "TestModule#MODULE-\d+": it is not declared in this module or imported from any imported module./,
		);
	});

	it("should build success", () => {
		const DatabaseModule = createModule({
			name: "DatabaseModule",
			declarations: [
				{
					serviceIdentifier: IDatabaseConfig,
					useValue: {
						type: "sqlite",
						host: "localhost",
						port: 3306,
						username: "root",
						password: "123456",
					},
				},
				{
					serviceIdentifier: IDatabase,
					useClass: DatabaseService,
				},
			],
			exports: [IDatabase],
		});

		const AuthModule = createModule({
			name: "AuthModule",
			declarations: [
				{
					serviceIdentifier: IAuthService,
					useClass: AuthService,
				},
			],
			exports: [IAuthService],
		});

		const UserModule = createModule({
			name: "UserModule",
			declarations: [
				{
					serviceIdentifier: IUser,
					useClass: UserService,
				},
			],
			exports: [IUser],
		});

		const AppModule = createModule({
			name: "AppModule",
			imports: [DatabaseModule, AuthModule, UserModule],
			declarations: [
				{
					serviceIdentifier: IApp,
					useClass: AppService,
				},
			],
			exports: [IApp],
		});

		const app = AppModule.resolve(IApp);

		expect(() => DatabaseModule.resolve(IDatabaseConfig)).toThrow(
			/Service identifier "IDatabaseConfig" is not exported from DatabaseModule#CONTAINER-\d+/,
		);
		expect(app.bootstrap()).toBe("Application bootstrapped successfully");
		expect(app.userService.getUser()).toEqual({ id: 1, name: "test user" });
		expect(app.databaseService.connect()).toBe(
			"Connected to sqlite at localhost:3306",
		);
		expect(app.authService.authenticate()).toEqual({
			authenticated: true,
			token: "test-token",
		});
		expect(() => AppModule.resolve(IDatabase)).toThrow(
			/Service identifier "IDatabase" is not exported from AppModule#CONTAINER-\d+./,
		);
	});

	it("should alias service identifier", () => {
		const AModule = createModule({
			name: "AModule",
			declarations: [
				{
					serviceIdentifier: "A",
					useValue: "A",
				},
			],
			exports: ["A"],
		});

		const BModule = createModule({
			name: "BModule",
			imports: [
				AModule.withAliases([
					{
						serviceIdentifier: "A",
						as: "B",
					},
				]),
			],
			exports: ["B"],
		});

		expect(BModule.resolve("B")).toBe("A");
		expect(BModule.isRegistered("A")).toBe(false);
	});

	it("should detect direct circular dependency", () => {
		// 创建两个模块的循环依赖：A -> B -> A
		const mockModuleA: Partial<MutableTestModule> = {
			name: "AModule",
			displayName: "AModule#TEST-A",
			declarations: [{ serviceIdentifier: "A", useValue: "A" }],
			exports: ["A"],
			imports: [], // 稍后会被设置
		};

		const mockModuleB: Partial<MutableTestModule> = {
			name: "BModule",
			displayName: "BModule#TEST-B",
			declarations: [{ serviceIdentifier: "B", useValue: "B" }],
			exports: ["B"],
			imports: [mockModuleA as IInternalModule],
		};

		// 设置循环依赖：A 导入 B
		mockModuleA.imports = [mockModuleB as IInternalModule];

		expect(() => {
			const builder = new ModuleBuilder(mockModuleA as IInternalModule);
			builder.validateAndCollectInfo();
		}).toThrow(
			/Circular dependency detected.*AModule#TEST-A.*BModule#TEST-B.*AModule#TEST-A/,
		);
	});

	it("should detect indirect circular dependency", () => {
		// 创建三个模块的循环依赖：A -> B -> C -> A
		const mockModuleA: Partial<MutableTestModule> = {
			name: "AModule",
			displayName: "AModule#TEST-A",
			declarations: [{ serviceIdentifier: "A", useValue: "A" }],
			exports: ["A"],
			imports: [], // 稍后会被设置
		};

		const mockModuleB: Partial<MutableTestModule> = {
			name: "BModule",
			displayName: "BModule#TEST-B",
			declarations: [{ serviceIdentifier: "B", useValue: "B" }],
			exports: ["B"],
			imports: [mockModuleA as IInternalModule],
		};

		const mockModuleC: Partial<MutableTestModule> = {
			name: "CModule",
			displayName: "CModule#TEST-C",
			declarations: [{ serviceIdentifier: "C", useValue: "C" }],
			exports: ["C"],
			imports: [mockModuleB as IInternalModule],
		};

		// 设置循环依赖：A 导入 C
		mockModuleA.imports = [mockModuleC as IInternalModule];

		expect(() => {
			const builder = new ModuleBuilder(mockModuleA as IInternalModule);
			builder.validateAndCollectInfo();
		}).toThrow(
			/Circular dependency detected.*AModule#TEST-A.*CModule#TEST-C.*BModule#TEST-B.*AModule#TEST-A/,
		);
	});

	it("should detect self-dependency", () => {
		// 创建自引用模块：Self -> Self
		const mockSelfModule: Partial<MutableTestModule> = {
			name: "SelfModule",
			displayName: "SelfModule#TEST-SELF",
			declarations: [{ serviceIdentifier: "Self", useValue: "self" }],
			exports: ["Self"],
			imports: [],
		};

		// 设置自引用
		mockSelfModule.imports = [mockSelfModule as IInternalModule];

		expect(() => {
			const builder = new ModuleBuilder(mockSelfModule as IInternalModule);
			builder.validateAndCollectInfo();
		}).toThrow(
			/Circular dependency detected.*SelfModule#TEST-SELF.*SelfModule#TEST-SELF/,
		);
	});
});
