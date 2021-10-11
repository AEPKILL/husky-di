/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 11:03:37
 */

import { createContainer, createServiceIdentifier, ValueProvider } from '..';

describe('container test', () => {
  test('container resolve', () => {
    const container = createContainer();
    expect(() => {
      container.resolve('unknown');
    }).toThrow(
      'attempted to resolve unregistered dependency service identifier: "unknown"'
    );
  });

  test('container resolve optional', () => {
    const container = createContainer();
    expect(container.resolve('unknown', { optional: true })).toBe(null);
    expect(
      container.resolve('unknown', { optional: true, defaultValue: 0 })
    ).toBe(0);
  });

  test('container register multiple', () => {
    const container = createContainer(container => {
      container.register('value', new ValueProvider({ useValue: 0 }));
      container.register('value', new ValueProvider({ useValue: 0 }));
    });
    expect(container.resolve('value')).toBe(0);
    expect(container.resolve('value', { multiple: true })).toStrictEqual([
      0,
      0,
    ]);
  });

  test('container other api test', () => {
    const IA = createServiceIdentifier<number>('IA');
    const provider = new ValueProvider({
      useValue: 2,
    });

    const container = createContainer(container => {
      container.register(IA, provider);
    });

    expect(container.isRegistered(IA)).toBe(true);
    expect(container.getAllRegisteredServiceIdentifiers()).toStrictEqual([IA]);
    expect(container.getProvider(IA)?.equal(provider)).toBe(true);
    expect(container.getAllProvider(IA).length).toBe(1);
    expect(container.getAllProvider(IA).every(it => it.equal(provider))).toBe(
      true
    );

    container.unRegister(IA, provider);
    expect(container.isRegistered(IA)).toBe(false);
  });
});
