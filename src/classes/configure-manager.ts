/**
 * @overview
 * @author AEPKILL
 * @created 2024-10-30 23:57:45
 */

export interface Configure {
  /**
   * @description
   * if this flag is true, the container will throw an error when the service identifier is not registered
   * @default false
   */
  strict: boolean;
}

export class ConfigureManager {
  private _configure: Configure = {
    strict: false
  };

  getConfigure(): Configure {
    return {
      ...this._configure
    };
  }

  setConfigure(configure: Partial<Configure>): void {
    this._configure = Object.assign(this._configure, configure);
  }
}
