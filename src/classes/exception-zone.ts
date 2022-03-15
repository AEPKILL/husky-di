/**
 * @overview
 * @author AEPKILL
 * @created 2022-03-15 09:25:15
 */

export type Teardown = null | ((error: any) => void);
export type Runnable<Args extends Array<any> = any[], Result = any> = (
  ...args: Args
) => Result;

export class ExceptionZone {
  static run(runnable: Runnable, teardown?: Teardown) {
    try {
      runnable();
    } catch (e) {
      if (teardown) {
        teardown(e);
      }
    }
  }
}
