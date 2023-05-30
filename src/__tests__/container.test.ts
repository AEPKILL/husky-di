import { describe, test, expect } from "@jest/globals";
import {
  ClassProvider,
  FactoryProvider,
  LifecycleEnum,
  ValueProvider,
  createContainer,
  createServiceIdentifier,
  formatStringsWithIndent,
  injectable,
} from "..";

describe("container  test", () => {
  test(`provider can register & can find`, () => {
    const container = createContainer("test");
    const testProvider = new ValueProvider({ useValue: "test" });
    container.register("test", testProvider);
    expect(container.isRegistered("test")).toBe(true);
    expect(container.getAllRegisteredServiceIdentifiers()).toStrictEqual([
      "test",
    ]);
  });

  test(`provider must have some lifecycle & accessibility`, () => {
    const container = createContainer("test");
    container.register(
      "test",
      new ValueProvider({
        useValue: "test",
        lifecycle: LifecycleEnum.transient,
      })
    );
    expect(() => {
      container.register(
        "test",
        new ValueProvider({
          useValue: "test",
          lifecycle: LifecycleEnum.resolution,
        })
      );
    }).toThrow(
      'all providers for the service identifier "test" must have a consistent lifecycle'
    );
    expect(() => {
      container.register(
        "test",
        new ValueProvider({
          useValue: "test",
          isPrivate: true,
        })
      );
    }).toThrow(
      'all providers for the service identifier "test" must have a consistent accessibility'
    );
  });

  test(`service identifier can register multiple provider`, () => {
    const container = createContainer("test");
    const test1Provider = new ValueProvider({ useValue: "test1" });
    const test2Provider = new ValueProvider({ useValue: "test2" });

    container.register("test", test1Provider);
    container.register("test", test2Provider);

    expect(container.getAllProvider("test")).toStrictEqual([
      test1Provider,
      test2Provider,
    ]);
  });

  test(`provider can't duplicate register`, () => {
    const container = createContainer("test");
    const testProvider = new ValueProvider({ useValue: "test" });
    container.register("test", testProvider);
    expect(() => {
      container.register("test", testProvider);
    }).toThrow("provider was already registered");
  });

  test(`provider can unregister`, () => {
    @injectable
    class Test {
      readonly id = Test._id++;

      static _id = 0;
    }

    const container = createContainer("test");
    const testProvider = new ClassProvider({
      useClass: Test,
      lifecycle: LifecycleEnum.singleton,
    });
    const testServiceIdentifier = createServiceIdentifier<Test>("test");
    const testRegistration = container.register(
      testServiceIdentifier,
      testProvider
    );

    expect(container.isRegistered(testServiceIdentifier)).toBe(true);
    expect(container.resolve(testServiceIdentifier).id).toBe(0);
    testRegistration.dispose();
    expect(container.isRegistered(testServiceIdentifier)).toBe(false);
    expect(() =>
      container.register(testServiceIdentifier, testProvider)
    ).not.toThrow();
    // unregister provider wil reset provider, so will create new instance, so id will be 1
    expect(container.resolve(testServiceIdentifier).id).toBe(1);
  });

  test("container resolve unregistered service identifier", () => {
    const container = createContainer("test");
    expect(() => {
      container.resolve("unknown");
    }).toThrow(
      'attempted to resolve unregistered dependency service identifier: "unknown"'
    );
  });

  test("container resolve unregistered constructor service identifier", () => {
    @injectable
    class Test {}
    const container = createContainer("test");
    expect(container.resolve(Test)).toBeInstanceOf(Test);
  });

  test("container can't resolve unregistered constructor service identifier without @injectable", () => {
    class Test {}
    const container = createContainer("test");
    expect(() => container.resolve(Test)).toThrow(
      formatStringsWithIndent([
        `resolve service identifier Test[#test]`,
        `service identifier "Test" can't be resolved, please use '@injectable' decorate it`,
      ])
    );
  });

  test(`resolve cycle dependency`, () => {
    const container = createContainer("test");
    container.register(
      "test1",
      new FactoryProvider({
        useFactory() {
          return container.resolve("test2");
        },
      })
    );
    container.register(
      "test2",
      new FactoryProvider({
        useFactory() {
          return container.resolve("test1");
        },
      })
    );

    expect(() => container.resolve("test1")).toThrow(
      "(( test1[#test] )) -> test2[#test] -> (( test1[#test] ))\n" +
        formatStringsWithIndent([
          "resolve service identifier test1[#test]",
          "resolve service identifier test2[#test]",
          "resolve service identifier test1[#test]",
          "circular dependency detected, try use ref or dynamic flag",
        ])
    );
  });
});
