/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 08:53:32
 */

import { Container } from '../classes/container';
import { IContainer } from '../interfaces/container.interface';

export function createContainer(
  name: string,
  register?: (container: IContainer) => void
): IContainer {
  const container = new Container(name);

  if (register) {
    register(container);
  }

  return container;
}
