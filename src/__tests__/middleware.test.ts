import { test, expect, describe } from "@jest/globals";
import {
  ClassProvider,
  LifecycleEnum,
  createContainer,
  createServiceIdentifier,
  inject,
  injectable,
  formatStringsWithIndent
} from "..";

describe("test middleware", () => {
  test("test middleware", () => {
    const container = createContainer("test");

    const test1 = createServiceIdentifier<Test1>(Symbol("test1"));

    @injectable()
    class Test1 {
      constructor() {
        throw new Error("test1");
      }
    }

    container.register(
      test1,
      new ClassProvider({
        useClass: Test1,
        lifecycle: LifecycleEnum.resolution
      })
    );

    expect(() => container.resolve(test1)).toThrow();

    container.addMiddleware((next) => (params) => {
      const { serviceIdentifier } = params;

      if (serviceIdentifier === test1) return "Test1";

      return next(params);
    });

    expect(() => container.resolve(test1)).not.toThrow();
    expect(container.resolve(test1)).toBe("Test1");
  });

  test("middleware error", () => {
    const container = createContainer("test");

    const test2 = createServiceIdentifier<string>(Symbol("test2"));

    @injectable()
    class Test1 {
      constructor(@inject(test2) readonly test2: string) {}
    }

    container.addMiddleware((next) => (params) => {
      const { serviceIdentifier } = params;

      if (serviceIdentifier === test2) throw new Error("test2");

      return next(params);
    });

    expect(() => container.resolve(Test1)).toThrow(
      "Test1[#test]\n" +
        formatStringsWithIndent([
          "resolve service identifier Test1[#test]",
          `service identifier \"Test1\" is not registered, but it is a constructor, use temporary class provider to resolve`,
          `resolve parameter #0 of constructor Test1`,
          `test2`
        ])
    );
  });
});
