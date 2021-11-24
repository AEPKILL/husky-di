/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 10:03:34
 */

export interface IUsing<T> {
  get(): T;
  dispose(): void;
}
