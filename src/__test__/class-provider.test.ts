/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 13:44:41
 */

import { CompilerMetadata, createContainer, Inject } from '..';

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

    const container = createContainer();

    expect(container.resolve(B).a).toStrictEqual(new A());

    const c = container.resolve(C);

    expect(c.a).toStrictEqual(new A());
    expect(c.b).toStrictEqual(container.resolve(B));
  });
});
