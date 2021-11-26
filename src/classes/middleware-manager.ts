/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 22:02:35
 */

export type Middleware<Args, Return> = ((args: Args) => Return) & {
  /**
   * 现在没用到，可以利用 skip 直接跳过一个 middleware 用于优化调用栈
   * @deprecated
   */
  skip?: (args: Args) => boolean;
};

export type MiddlewareNext<Args, Return> = (
  next: Middleware<Args, Return>
) => Middleware<Args, Return>;

export type RemoveMiddleware = () => void;

export class MiddlewareManager<Args, Return> {
  private readonly _defaultMiddleware: Middleware<Args, Return>;
  private _middleware!: Middleware<Args, Return>;
  private _middlewareArray: Array<MiddlewareNext<Args, Return>>;

  constructor(middleware: Middleware<Args, Return>) {
    this._middlewareArray = [];
    this._middleware = middleware;
    this._defaultMiddleware = middleware;
  }

  add(middleware: MiddlewareNext<Args, Return>): RemoveMiddleware {
    const isMiddlewareExists = this._middlewareArray.find(
      it => it === middleware
    );

    if (isMiddlewareExists) {
      throw new Error('middleware is already exists.');
    }

    this._middlewareArray.unshift(middleware);
    this._applyMiddleware();

    return () => {
      this._middlewareArray = this._middlewareArray.filter(
        it => it !== middleware
      );
      this._applyMiddleware();
    };
  }

  invoke(args: Args): Return {
    return this._middleware(args);
  }

  private _applyMiddleware() {
    this._middleware = this._middlewareArray.reduce(
      (middleware, nextMiddleware) => {
        return nextMiddleware(middleware);
      },
      this._defaultMiddleware
    );
  }
}
