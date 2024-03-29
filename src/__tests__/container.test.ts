import { describe, test, expect } from "@jest/globals";
import {
  ClassProvider,
  FactoryProvider,
  LifecycleEnum,
  ServiceIdentifierManager,
  ValueProvider,
  createContainer,
  createServiceIdentifier,
  formatStringsWithIndent,
  inject,
  injectable,
  Ref,
  createServiceDecorator,
  createContainerFromRegistration
} from "..";
import { Registration } from "@/classes/registration";

describe("container  test", () => {
  test(`provider can register & can find`, () => {
    const container = createContainer("test");
    const testProvider = new ValueProvider({ useValue: "test" });
    container.register("test", testProvider);
    expect(container.isRegistered("test")).toBe(true);
    expect(container.getAllRegisteredServiceIdentifiers()).toStrictEqual([
      "test"
    ]);
  });

  test(`ref and dynamic flag can't be true at the same time`, () => {
    const container = createContainer("test");
    const testProvider = new ValueProvider({ useValue: "test" });
    container.register("test", testProvider);
    expect(() => {
      container.resolve("test", { dynamic: true, ref: true });
    }).toThrow(`ref and dynamic flag can't be true at the same time`);
  });

  test(`provider must have some lifecycle & accessibility`, () => {
    const container = createContainer("test");
    container.register(
      "test",
      new ValueProvider({
        useValue: "test",
        lifecycle: LifecycleEnum.transient
      })
    );
    expect(() => {
      container.register(
        "test",
        new ValueProvider({
          useValue: "test",
          lifecycle: LifecycleEnum.resolution
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
          isPrivate: true
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
      test2Provider
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
    @injectable()
    class Test {
      readonly id = Test._id++;

      static _id = 0;
    }

    const container = createContainer("test");
    const testProvider = new ClassProvider({
      useClass: Test,
      lifecycle: LifecycleEnum.singleton
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

  test("can't resolve unregistered service identifier", () => {
    const container = createContainer("test");
    expect(() => {
      container.resolve("unknown");
    }).toThrow(
      'attempted to resolve unregistered dependency service identifier: "unknown"'
    );
  });

  test("can resolve unregistered constructor service identifier", () => {
    @injectable()
    class Test {}
    const container = createContainer("test");
    expect(container.resolve(Test)).toBeInstanceOf(Test);
    expect(container.resolve(Test, { multiple: true })).toStrictEqual([
      container.resolve(Test)
    ]);
  });

  test("container can't resolve unregistered constructor service identifier without @injectable()", () => {
    class Test {}
    const container = createContainer("test");
    expect(() => container.resolve(Test)).toThrow(
      "Test[#test]\n" +
        formatStringsWithIndent([
          "resolve service identifier Test[#test]",
          `service identifier "Test" is not registered, but it is a constructor, use temporary class provider to resolve`,
          "constructor \"Test\" can't be resolved, please use '@injectable()' decorate it"
        ])
    );
  });

  test(`can't resolve cycle dependency`, () => {
    const container = createContainer("test");
    container.register(
      "test1",
      new FactoryProvider({
        useFactory() {
          return container.resolve("test2");
        }
      })
    );
    container.register(
      "test2",
      new FactoryProvider({
        useFactory() {
          return container.resolve("test1");
        }
      })
    );

    expect(() => container.resolve("test1")).toThrow(
      "(( test1[#test] )) -> test2[#test] -> (( test1[#test] ))\n" +
        formatStringsWithIndent([
          "resolve service identifier test1[#test]",
          "resolve service identifier test2[#test]",
          "resolve service identifier test1[#test]",
          "circular dependency detected, try use ref or dynamic flag"
        ])
    );
  });

  test(`resolve cycle dependency with ref or dynamic`, () => {
    const container = createContainer("test");
    const test1 = createServiceIdentifier<Test1>(Symbol("test1"));
    const test2 = createServiceIdentifier<Test2>(Symbol("test2"));
    const test3 = createServiceIdentifier<Test3>(Symbol("test3"));
    @injectable()
    class Test1 {
      constructor(
        @inject(test2, { ref: true }) readonly test2: Ref<Test2>,
        @inject(test3, { dynamic: true }) readonly test3: Ref<Test3>
      ) {}
    }

    @injectable()
    class Test2 {
      constructor(@inject(test1) readonly test1: Test1) {}
    }

    @injectable()
    class Test3 {
      constructor(@inject(test1) readonly test1: Test1) {}
    }

    container.register(
      test1,
      new ClassProvider({
        useClass: Test1,
        lifecycle: LifecycleEnum.resolution
      })
    );
    container.register(
      test2,
      new ClassProvider({
        useClass: Test2,
        lifecycle: LifecycleEnum.resolution
      })
    );
    container.register(
      test3,
      new ClassProvider({
        useClass: Test3,
        lifecycle: LifecycleEnum.resolution
      })
    );

    let test1Instance: Test1;

    expect(() => {
      test1Instance = container.resolve(test1);
    }).not.toThrow();

    expect(test1Instance!.test2.resolved).toBe(false);
    expect(test1Instance!.test3.resolved).toBe(false);
    expect(test1Instance!.test2.current.test1).toBe(test1Instance!);
    expect(test1Instance!.test3.current.test1).toBe(test1Instance!);
    expect(test1Instance!.test2.resolved).toBe(true);
    expect(test1Instance!.test3.resolved).toBe(true);
  });

  test(`resolve optional service identifier`, () => {
    const container = createContainer("test");
    expect(
      container.resolve("unknown", { optional: true, defaultValue: 2333 })
    ).toBe(2333);
  });

  test(`resolve service identifier multiple instance`, () => {
    const container = createContainer("test");
    container.register("test", new ValueProvider({ useValue: 1 }));
    container.register("test", new ValueProvider({ useValue: 2 }));
    expect(container.resolve("test", { multiple: true })).toStrictEqual([1, 2]);
  });

  test(`resolve factory with exception`, () => {
    const container = createContainer("test");
    container.register(
      "test",
      new FactoryProvider({
        useFactory: () => {
          throw new Error("something error");
        }
      })
    );

    expect(() => container.resolve("test")).toThrow(
      "test[#test]\n" +
        formatStringsWithIndent([
          "resolve service identifier test[#test]",
          "factory function execute exception: something error"
        ])
    );
  });

  test(`resolve class with exception`, () => {
    const container = createContainer("test");

    @injectable()
    class Test {
      constructor() {
        throw new Error();
      }
    }

    container.register(
      "test",
      new ClassProvider({
        useClass: Test
      })
    );

    expect(() => container.resolve("test")).toThrow(
      "test[#test]\n" +
        formatStringsWithIndent([
          "resolve service identifier test[#test]",
          `try create "Test" instance fail: unknown`
        ])
    );
  });

  test(`inject class constructor parameters without @inject decorator`, () => {
    const container = createContainer("test");

    @injectable()
    class Test1 {}
    @injectable()
    class Test2 {
      constructor(public readonly test1: Test1) {}
    }
    container.register(
      "test2",
      new ClassProvider({
        useClass: Test2
      })
    );
    expect((container.resolve("test2") as Test2).test1).toBeInstanceOf(Test1);
  });

  test(`can't create same service identifier`, () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    serviceIdentifierManager.createServiceIdentifier("test");
    expect(() =>
      serviceIdentifierManager.createServiceIdentifier("test")
    ).toThrow('service identifier: "test" is already exists');
  });

  test(`can't resolve private service identifier`, () => {
    const container = createContainer("test");
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const test1 =
      serviceIdentifierManager.createServiceIdentifier<Test1>("test1");
    const test2 =
      serviceIdentifierManager.createServiceIdentifier<Test2>("test2");

    @injectable()
    class Test1 {}

    @injectable()
    class Test2 {
      constructor(@inject(test1) readonly test1: Test1) {}
    }

    container.register(
      test1,
      new ClassProvider({ useClass: Test1, isPrivate: true })
    );
    container.register(test2, new ClassProvider({ useClass: Test2 }));

    expect(container.resolve(test2).test1).toBeInstanceOf(Test1);
    expect(() => container.resolve(test1)).toThrow(
      "test1[#test]\n" +
        formatStringsWithIndent([
          `resolve service identifier test1[#test]`,
          `service identifier "test1" is private, can only be resolved within the container "test"`
        ])
    );
  });

  test(`can't use  "@injectable()" decorate class twice`, () => {
    expect(() => {
      @injectable()
      @injectable()
      class Test {}

      return Test;
    }).toThrow(`can't use  "@injectable()" decorate class "Test" twice`);
  });

  test(`use "createServiceDecorator can replace @inject."`, () => {
    const container = createContainer("test");
    const test1 = createServiceDecorator<Test1>("test1");
    const test2 = createServiceDecorator<Test2>("test2");

    @injectable()
    class Test1 {}

    @injectable()
    class Test2 {
      constructor(
        @test1() readonly test1: Test1,
        @test1({ multiple: true }) readonly test11: Test1[]
      ) {}
    }

    container.register(
      test1.serviceIdentifier,
      new ClassProvider({ useClass: Test1 })
    );
    container.register(
      test2.serviceIdentifier,
      new ClassProvider({ useClass: Test2 })
    );

    expect(container.resolve(test2.serviceIdentifier).test1).toBeInstanceOf(
      Test1
    );
    expect(container.resolve(test2.serviceIdentifier).test11).toBeInstanceOf(
      Array
    );
    for (const item of container.resolve(test2.serviceIdentifier).test11) {
      expect(item).toBeInstanceOf(Test1);
    }
  });

  test(`can create container from registration`, () => {
    const registration = new Registration();

    let value = 0;

    registration.register(
      "test",
      new FactoryProvider({
        lifecycle: LifecycleEnum.singleton,
        useFactory() {
          return value++;
        }
      })
    );

    const container1 = createContainerFromRegistration(
      "container1",
      registration
    );
    const container2 = createContainerFromRegistration(
      "container2",
      registration
    );

    expect(container1.resolve("test")).toBe(0);
    expect(container2.resolve("test")).toBe(1);
    expect(container1.getProvider("test")).not.toBe(
      container2.getProvider("test")
    );
  });
});
