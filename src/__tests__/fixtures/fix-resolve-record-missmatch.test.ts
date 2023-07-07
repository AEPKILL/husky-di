import { test, expect } from "@jest/globals";
import {
  ClassProvider,
  LifecycleEnum,
  createContainer,
  createServiceIdentifier,
  formatStringsWithIndent,
  inject,
  injectable
} from "../..";

test(`provider can register & can find`, () => {
  const container = createContainer("test");

  const test1 = createServiceIdentifier<Test1>(Symbol("test1"));
  const test2 = createServiceIdentifier<Test2>(Symbol("test2"));
  const test3 = createServiceIdentifier<Test3>(Symbol("test3"));

  @injectable
  class Test1 {
    constructor() {}
  }

  @injectable
  class Test2 {
    constructor() {
      throw new Error("exception");
    }
  }

  @injectable
  class Test3 {
    constructor(
      @inject(test1) readonly test1: Test1,
      @inject(test2) readonly test2: Test2
    ) {}
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

  expect(() => container.resolve(test3)).toThrow(
    `Symbol(test3)[#test] -> Symbol(test2)[#test]\n${formatStringsWithIndent([
      "resolve service identifier Symbol(test3)[#test]",
      "resolve parameter #1 of constructor Test3",
      "resolve service identifier Symbol(test2)[#test]",
      'try create "Test2" instance fail: exception'
    ])}`
  );
});
