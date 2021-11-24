/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 13:45:53
 */

import {
  ClassProvider,
  createContainer,
  FactoryProvider,
  Inject,
  LifecycleEnum,
  Ref,
  ServiceIdentifierManager,
} from '..';

describe('lifecycle test', () => {
  const serviceIdentifierManager = new ServiceIdentifierManager();
  const ITest = serviceIdentifierManager.createServiceIdentifier<Test>('test');

  class Test {
    constructor(
      @Inject('factory') readonly a: number,
      @Inject('factory') readonly b: number,
      @Inject('factory') readonly c: number,
      @Inject('factory', { ref: true }) readonly d: Ref<number>
    ) {}
  }

  test('transient lifecycle', () => {
    const container = createContainer('Transient');
    let count = 0;

    container.register(
      'test',
      new ClassProvider({
        useClass: Test,
      })
    );
    container.register(
      'factory',
      new FactoryProvider({
        useFactory() {
          return count++;
        },
      })
    );

    const test = container.resolve(ITest);

    expect(test.a).toBe(0);
    expect(test.b).toBe(1);
    expect(test.c).toBe(2);
    expect(test.d.current).toBe(3);
    expect(test.d.current).toBe(3);
  });

  test('singleton lifecycle', () => {
    const container = createContainer('Singleton');
    let count = 0;

    container.register(
      'test',
      new ClassProvider({
        useClass: Test,
      })
    );
    container.register(
      'factory',
      new FactoryProvider({
        lifecycle: LifecycleEnum.singleton,
        useFactory() {
          return count++;
        },
      })
    );

    const test = container.resolve(ITest);

    expect(test.a).toBe(0);
    expect(test.b).toBe(0);
    expect(test.c).toBe(0);
    expect(container.resolve('factory')).toBe(0);
  });

  test('resolutionScoped lifecycle', () => {
    const container = createContainer('ResolutionScoped');
    let count = 0;

    container.register(
      'test',
      new ClassProvider({
        useClass: Test,
      })
    );
    container.register(
      'factory',
      new FactoryProvider({
        lifecycle: LifecycleEnum.resolutionScoped,
        useFactory() {
          return count++;
        },
      })
    );

    const test = container.resolve(ITest);

    expect(test.a).toBe(0);
    expect(test.b).toBe(0);
    expect(test.c).toBe(0);
    expect(container.resolve('factory')).toBe(1);
    expect(test.d.current).toBe(0);
  });

  test('resolutionScoped for factory', () => {
    const IA = serviceIdentifierManager.createServiceIdentifier<number>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<number>('IB');

    let count = 0;

    const container = createContainer('FactoryResolutionScoped', container => {
      container.register(
        IA,
        new FactoryProvider({
          lifecycle: LifecycleEnum.resolutionScoped,
          useFactory() {
            return count++;
          },
        })
      );
      container.register(
        IB,
        new FactoryProvider({
          useFactory(container) {
            return container.resolve(IA) + container.resolve(IA);
          },
        })
      );
    });
    expect(container.resolve(IB)).toBe(0);
  });

  test('resolutionScoped ref for class', () => {
    class A {
      constructor(
        @Inject('b') readonly b: B,
        @Inject('c', { ref: true }) readonly c: Ref<C>
      ) {}
    }

    class B {}

    class C {
      constructor(@Inject('b') readonly b: B) {}
    }
    const container = createContainer('ResolutionScopedRefForClass');
    container.register(
      'a',
      new ClassProvider({
        lifecycle: LifecycleEnum.resolutionScoped,
        useClass: A,
      })
    );
    container.register(
      'b',
      new ClassProvider({
        lifecycle: LifecycleEnum.resolutionScoped,
        useClass: B,
      })
    );
    container.register(
      'c',
      new ClassProvider({
        lifecycle: LifecycleEnum.resolutionScoped,
        useClass: C,
      })
    );
    const IA = serviceIdentifierManager.createServiceIdentifier<A>('a');
    const a = container.resolve(IA);
    expect(a.b).toBe(a.c.current.b);
  });

  test('resolutionScoped ref for class with multiple', () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<A>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<B>('IB');

    class A {
      constructor(
        @Inject(IB) readonly b: B,
        @Inject(IB, { ref: true }) readonly b2: Ref<B>,

        @Inject(IB, { multiple: true }) readonly b3: B[],
        @Inject(IB) readonly b4: B
      ) {}
    }
    class B {
      constructor() {}
    }

    const container = createContainer(
      'ResolutionScopedMultipleRefForClass',
      container => {
        container.register(
          IA,
          new ClassProvider({
            useClass: A,
          })
        );
        container.register(
          IB,
          new ClassProvider({
            lifecycle: LifecycleEnum.resolutionScoped,
            useClass: B,
          })
        );
      }
    );

    const a = container.resolve(IA);

    expect(a.b).not.toBe(a.b2);
    expect(a.b).not.toBe(a.b3);
    expect(a.b).toBe(a.b4);
    expect(a.b).toBe(a.b2.current);
    expect(a.b).toBe(a.b3[0]);
  });

  test('resolutionScoped ref for class with multiple', () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<A>('IA333333');
    const IB = serviceIdentifierManager.createServiceIdentifier<B>('IB333333');

    class A {
      constructor(
        @Inject(IB, { multiple: true }) readonly b: B[],
        @Inject(IB) readonly b2: B
      ) {}
    }
    class B {
      constructor() {}
    }

    const container = createContainer(
      'ResolutionScopedMultipleRefForClass2',
      container => {
        container.register(
          IA,
          new ClassProvider({
            useClass: A,
          })
        );
        container.register(
          IB,
          new ClassProvider({
            lifecycle: LifecycleEnum.resolutionScoped,
            useClass: B,
          })
        );
      }
    );

    const a = container.resolve(IA);

    expect(a.b[0]).toBe(a.b2);
  });
});
