import { createServiceIdentifier, resolve } from "@husky-di/core";
import { describe, expect, it } from "vitest";
import { build, createModule } from "../src/index";

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

		const appContainer = build(AppModule);
		const app = appContainer.resolve(IApp);

		expect(app.bootstrap()).toBe("Application bootstrapped successfully");
		expect(app.userService.getUser()).toEqual({ id: 1, name: "test user" });
		expect(app.databaseService.connect()).toBe(
			"Connected to sqlite at localhost:3306",
		);
		expect(app.authService.authenticate()).toEqual({
			authenticated: true,
			token: "test-token",
		});
		expect(() => appContainer.resolve(IDatabase)).toThrow(
			/Service identifier "IDatabase" is not exported from AppModule#CONTAINER-\d+./,
		);
	});
});
