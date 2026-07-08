/**
 * Logger interface for the basic example.
 *
 * @overview
 * Defines the minimal logging contract used by the example services.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface ILogger {
	log(message: string): void;
}

export const ILogger = createServiceIdentifier<ILogger>("ILogger");
export const IAppLogger = createServiceIdentifier<ILogger>("IAppLogger");
