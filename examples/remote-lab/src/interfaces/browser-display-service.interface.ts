/**
 * @overview Display service exposed by each browser.
 * @author AEPKILL
 * @created 2026-08-21 01:06:59
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IBrowserDisplayService {
	showMessage(message: string): string;
}

export const IBrowserDisplayService =
	createServiceIdentifier<IBrowserDisplayService>("BrowserDisplayService");
