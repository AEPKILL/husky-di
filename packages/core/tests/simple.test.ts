import { describe, expect, it } from "vitest";
import {
	type CreateAliasRegistrationOptions,
	type CreateClassRegistrationOptions,
	type CreateFactoryRegistrationOptions,
	type CreateValueRegistrationOptions,
	createContainer,
	createServiceIdentifier,
	type IContainer,
	type IsRegisteredOptions,
	type ResolveOptions,
	rootContainer,
} from "../src/index";

describe("Simple Test", () => {
	class TestService {
		readonly name: string = "TestService";
	}

	const ITestService = createServiceIdentifier<TestService>("ITestService");

	it("should create container", () => {
		const container = createContainer();
		expect(container).toBeDefined();
		expect(container.name).toBe("DefaultContainer");
		expect(container.parent).toBe(rootContainer);
	});

	it("should create container with name", () => {
		const container = createContainer("TestContainer");
		expect(container).toBeDefined();
		expect(container.name).toBe("TestContainer");
		expect(container.parent).toBe(rootContainer);
	});

	it("should have unique id", () => {
		const container1 = createContainer("TestContainer");
		const container2 = createContainer("TestContainer");
		expect(container1.id).not.toBe(container2.id);
	});

	it("should have displayName", () => {
		const container = createContainer("TestContainer");
		expect(container.displayName).toBe(`TestContainer#${container.id}`);
	});

	it("should have parent", () => {
		const container = createContainer("TestContainer");
		expect(container.parent).toBe(rootContainer);
	});

	it("should special parent", () => {
		const parentContainer = createContainer("ParentContainer");
		const container = createContainer("TestContainer", parentContainer);
		expect(container.parent).toBe(parentContainer);
	});

	it("should resolve instance", () => {
		const container = createContainer("TestContainer");
		container.register("TestService", {
			useClass: TestService,
		});
		const instance = container.resolve<TestService>("TestService");
		expect(instance).toBeDefined();
		expect(instance.name).toBe("TestService");
	});

	it("should resolve instance with options", () => {
		const container = createContainer("TestContainer");
		container.register(ITestService, {
			useClass: TestService,
		});
		container.register(ITestService, {
			useClass: TestService,
		});
		const instances = container.resolve(ITestService, {
			multiple: true,
		});
		expect(instances).toBeDefined();
		expect(instances.length).toBe(2);
		expect(instances[0].name).toBe("TestService");
		expect(instances[1].name).toBe("TestService");
	});

	it("should resolve instance with useValue", () => {
		const container = createContainer("TestContainer");
		container.register("TestValue", {
			useValue: "TestValue",
		});
		const instance = container.resolve("TestValue");
		expect(instance).toBe("TestValue");
	});

	it("should resolve instance with useFactory", () => {
		const container = createContainer("TestContainer");
		container.register("TestValue", {
			useFactory: () => "TestValue",
		});
		const instance = container.resolve("TestValue");
		expect(instance).toBe("TestValue");
	});
});
