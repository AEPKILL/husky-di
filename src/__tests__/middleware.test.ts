import { test, expect, describe } from "@jest/globals";
import {
  ClassProvider,
  LifecycleEnum,
  createContainer,
  createServiceIdentifier,
  injectable
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
});
