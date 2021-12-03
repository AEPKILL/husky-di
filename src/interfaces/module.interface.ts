/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-26 10:06:37
 */

import { IModuleContainer } from './module-container.interface';

export interface Module {
  createModuleContainer(): IModuleContainer;
}
