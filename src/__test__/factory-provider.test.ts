/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 13:42:38
 */

import { createContainer, FactoryProvider, LifecycleEnum } from '..';

describe('factory provider', () => {
  test('factory provider basic', () => {
    const container = createContainer('factoryBasicTest');
    let count = 0;
    let count2 = 0;

    container.register(
      'factory',
      new FactoryProvider({
        useFactory() {
          return 0;
        },
      })
    );
    expect(container.resolve('factory')).toBe(0);

    container.register(
      'factory2',
      new FactoryProvider({
        useFactory() {
          return count++;
        },
      })
    );
    expect(container.resolve('factory2')).toBe(0);
    expect(container.resolve('factory2')).toBe(1);

    container.register(
      'factory3',
      new FactoryProvider({
        lifecycle: LifecycleEnum.singleton,
        useFactory() {
          return count2++;
        },
      })
    );
    expect(container.resolve('factory3')).toBe(0);
    expect(container.resolve('factory3')).toBe(0);
  });
});
