/**
 * @overview Browser display service contract exposed to the Node application.
 * @author AEPKILL
 * @created 2026-08-20 23:09:54
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IBrowserDisplayService {
	showMessage(message: string): string;
}

export const IBrowserDisplayService =
	createServiceIdentifier<IBrowserDisplayService>("IBrowserDisplayService");
