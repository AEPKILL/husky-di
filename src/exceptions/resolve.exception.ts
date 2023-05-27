/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 09:32:03
 */

// define an resolve exception
export class ResolveException extends Error {
  private __isResolveException = true;
  static isResolveException(error: any): error is ResolveException {
    return error && (error as ResolveException).__isResolveException === true;
  }
}
