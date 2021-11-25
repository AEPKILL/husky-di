/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 10:57:01
 */

import { IUsing } from '../interfaces/using.interface';

export type UsingCallback<T extends any[]> = <R>(
  callback: (...args: T) => R
) => R;

export function using<A>(usingA: IUsing<A>): UsingCallback<[A]>;
export function using<A, B>(
  usingA: IUsing<A>,
  usingB: IUsing<B>
): UsingCallback<[A, B]>;
export function using<A, B, C>(
  usingA: IUsing<A>,
  usingB: IUsing<B>,
  usingC: IUsing<C>
): UsingCallback<[A, B, C]>;
export function using<A, B, C, D>(
  usingA: IUsing<A>,
  usingB: IUsing<B>,
  usingC: IUsing<C>,
  usingD: IUsing<D>
): UsingCallback<[A, B, C, D]>;
export function using(...usings: IUsing<any>[]): UsingCallback<any[]> {
  return callback => {
    try {
      const args = usings.map(it => it.get());
      return callback(...args);
    } finally {
      usings.forEach(it => {
        it.dispose();
      });
    }
  };
}
