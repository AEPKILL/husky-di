/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 09:56:53
 */

import {
  ClassProvider,
  createContainer,
  createServiceIdentifier,
  FactoryProvider,
  Inject,
  LifecycleEnum,
  Module,
  ValueProvider,
} from '..';

describe('module test', () => {
  const ITest = createServiceIdentifier<Test>('test');
  const IA = createServiceIdentifier<number>('a');
  const IB = createServiceIdentifier<number>('b');
  class Test {
    constructor(@Inject(IA) readonly a: number) {}
  }

  const module = new Module({
    export: [
      { serviceIdentifier: IA, provider: new ValueProvider({ useValue: 0 }) },
    ],
  });

  test('load module', () => {
    const container = createContainer(container => {
      container.load(module);
      container.register(ITest, new ClassProvider({ useClass: Test }));
    });

    expect(container.resolve(ITest).a).toBe(0);
  });

  test('module import', () => {
    const module2 = new Module({
      import: [module],
      export: [
        { serviceIdentifier: IB, provider: new ValueProvider({ useValue: 1 }) },
      ],
    });
    const container = createContainer(container => {
      container.load(module2);
      container.register(ITest, new ClassProvider({ useClass: Test }));
    });

    expect(container.resolve(ITest).a).toBe(0);
  });

  test('module bind to multiple container should be isolate', () => {
    let count = 0;
    const module = new Module({
      export: [
        {
          serviceIdentifier: IB,
          provider: new FactoryProvider({
            lifecycle: LifecycleEnum.singleton,
            useFactory() {
              return count++;
            },
          }),
        },
      ],
    });
    const container = createContainer(container => {
      container.load(module);
    });
    const container2 = createContainer(container => {
      container.load(module);
    });

    expect(container.resolve(IB)).toBe(0);
    expect(container.resolve(IB)).toBe(0);

    expect(container2.resolve(IB)).toBe(1);
    expect(container2.resolve(IB)).toBe(1);
  });

  test('unbind module', () => {
    const container = createContainer(container => {
      container.load(module);
    });

    expect(container.resolve(IA)).toBe(0);

    container.unload(module);

    expect(() => container.resolve(IA)).toThrow(
      'attempted to resolve unregistered dependency service identifier: "a"'
    );
  });
});
