/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-24 16:34:34
 */

export class ResolveException extends Error {
  /**
   * todo: why jest instanceof not work?
   * run in jest
   * ```
   * class A extends Error {}
   *
   * new A() instanceof A // false
   * ```
   */

  static isResolveException(error: any): boolean {
    return Boolean(error && error instanceof ResolveException);
  }
}
