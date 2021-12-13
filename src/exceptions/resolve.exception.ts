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
  private readonly _isResolveException = true;

  static isResolveException(error: any) {
    return error && (error as ResolveException)._isResolveException;
  }
}
