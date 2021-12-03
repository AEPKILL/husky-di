/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-26 10:03:23
 */
import { IContainer } from './container.interface';

export interface IModuleContainer extends Pick<IContainer, 'resolve'> {
  readonly name: string;
}
