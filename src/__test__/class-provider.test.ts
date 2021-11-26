/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 13:44:41
 */

import {
  ClassProvider,
  CompilerMetadata,
  createContainer,
  Inject,
  LifecycleEnum,
  Ref,
  ServiceIdentifierManager,
} from '..';
import { generateStringsIndent } from '../shared/helpers/string.helper';

describe('class provider test', () => {
  test('constructor can be inject', () => {
    class A {}

    // 必须添加装饰器才可以触发元数据
    @CompilerMetadata
    class B {
      constructor(readonly a: A) {}
    }

    class C {
      constructor(@Inject(B) readonly b: B, readonly a: A) {}
    }

    const container = createContainer('Container1');

    expect(container.resolve(B).a).toStrictEqual(new A());

    const c = container.resolve(C);

    expect(c.a).toStrictEqual(new A());
    expect(c.b).toStrictEqual(container.resolve(B));
  });

  test('constructor resolve exception', () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<A>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<B>('IB');
    const IC = serviceIdentifierManager.createServiceIdentifier<C>('IC');

    class A {}
    class B {}
    class C {
      constructor(@Inject(IA) readonly a: A, @Inject(IB) readonly b: B) {}
    }

    const container = createContainer('Container2', container => {
      container.register(IA, new ClassProvider({ useClass: A }));
      container.register(IC, new ClassProvider({ useClass: C }));
    });

    expect(() => container.resolve(IC)).toThrow(
      'IC[#Container2] -> IB[#Container2]\n' +
        generateStringsIndent([
          'resolve service identifier IC[#Container2]',
          'resolve parameter #0 of constructor C',
          'resolve service identifier IB[#Container2]',
          'attempted to resolve unregistered dependency service identifier: "IB"',
        ])
    );
  });

  test('circle reference', () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<A>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<B>('IB');

    class A {
      constructor(@Inject(IB, { ref: true }) readonly b: Ref<B>) {}
    }
    class B {
      constructor(@Inject(IA) readonly a: A) {}
    }

    const container = createContainer('Container3', container => {
      container.register(
        IA,
        new ClassProvider({
          lifecycle: LifecycleEnum.resolutionScoped,
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
    });

    const b = container.resolve(IB);

    expect(b.a.b.current).toBe(b);
  });

  test('circle reference exception', () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<A>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<B>('IB');
    const IC = serviceIdentifierManager.createServiceIdentifier<C>('IC');
    const ID = serviceIdentifierManager.createServiceIdentifier<D>('ID');

    class A {
      constructor(@Inject(IB, { ref: true }) readonly b: Ref<B>) {}
    }
    class B {
      constructor(@Inject(IC) readonly c: C) {}
    }

    class C {
      constructor(@Inject(ID) readonly d: D) {}
    }

    class D {
      constructor(@Inject(IB) readonly b: B) {}
    }

    const container = createContainer('Container4', container => {
      container.register(
        IA,
        new ClassProvider({
          useClass: A,
        })
      );
      container.register(
        IB,
        new ClassProvider({
          useClass: B,
        })
      );
      container.register(
        IC,
        new ClassProvider({
          useClass: C,
        })
      );
      container.register(
        ID,
        new ClassProvider({
          useClass: D,
        })
      );
    });
    expect(() => container.resolve(IA).b.current).toThrow(
      'IA[#Container4] -> IB[#Container4,Ref] -> (( IB[#Container4] )) -> IC[#Container4] -> ID[#Container4] -> (( IB[#Container4] ))\n' +
        generateStringsIndent([
          'resolve service identifier IA[#Container4]',
          'resolve parameter #0 of constructor A',
          'resolve service identifier IB[#Container4,Ref]',
          '"IB" is a ref value, wait for use',
          'resolve service identifier IB[#Container4]',
          'resolve parameter #0 of constructor B',
          'resolve service identifier IC[#Container4]',
          'resolve parameter #0 of constructor C',
          'resolve service identifier ID[#Container4]',
          'resolve parameter #0 of constructor D',
          'resolve service identifier IB[#Container4]',
          'circular dependency detected! try use ref flag or dynamic flag',
        ])
    );
  });
});
