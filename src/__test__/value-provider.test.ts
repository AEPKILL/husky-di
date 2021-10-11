/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 13:44:36
 */

import { createContainer, ValueProvider } from '..';

describe('value provider', () => {
  const container = createContainer();
  container.register(
    'value',
    new ValueProvider({
      useValue: 0,
    })
  );
  test('value provider basic', () => {
    expect(container.resolve('value')).toBe(0);
    expect(container.resolve('value', { multiple: true })).toStrictEqual([0]);
    expect(container.resolve('value', { optional: true })).toBe(0);
    expect(container.resolve('value', { ref: true }).current).toBe(0);
  });
});
