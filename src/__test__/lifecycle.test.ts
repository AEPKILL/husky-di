/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 13:45:53
 */

import {
  ClassProvider,
  createContainer,
  FactoryProvider,
  inject,
  LifecycleEnum,
  Ref,
  injectable,
  ServiceIdentifierManager,
} from '..';

describe('lifecycle test', () => {
  const serviceIdentifierManager = new ServiceIdentifierManager();
  const ITest = serviceIdentifierManager.createServiceIdentifier<Test>('test');

  @injectable
  class Test {
    constructor(
      @inject('factory') readonly a: number,
      @inject('factory') readonly b: number,
      @inject('factory') readonly c: number,
      @inject('factory', { ref: true }) readonly d: Ref<number>
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
    @injectable
    class A {
      constructor(
        @inject('b') readonly b: B,
        @inject('c', { ref: true }) readonly c: Ref<C>
      ) {}
    }

    @injectable
    class B {}
    @injectable
    class C {
      constructor(@inject('b') readonly b: B) {}
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

    @injectable
    class A {
      constructor(
        @inject(IB) readonly b: B,
        @inject(IB, { ref: true }) readonly b2: Ref<B>,

        @inject(IB, { multiple: true }) readonly b3: B[],
        @inject(IB) readonly b4: B
      ) {}
    }
    @injectable
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

    @injectable
    class A {
      constructor(
        @inject(IB, { multiple: true }) readonly b: B[],
        @inject(IB) readonly b2: B
      ) {}
    }
    @injectable
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
