/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 22:39:29
 */

import { Container } from "@/impls/Container";
import type { IContainer } from "@/interfaces/container.interface";

export function createContainer(
	name: string = "DefaultContainer",
	parent?: IContainer,
): IContainer {
	return new Container(name, parent);
}
