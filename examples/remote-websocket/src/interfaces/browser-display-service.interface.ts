/**
 * @overview Display service exposed by each browser.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IBrowserDisplayService {
	showMessage(message: string): string;
}

export const IBrowserDisplayService =
	createServiceIdentifier<IBrowserDisplayService>("BrowserDisplayService");
