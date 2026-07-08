/**
 * Application configuration interface for the basic example.
 *
 * @overview
 * Defines the configuration values consumed by the basic example services.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IAppConfig {
	readonly appName: string;
	readonly usersEndpoint: string;
}

export const IAppConfig = createServiceIdentifier<IAppConfig>("IAppConfig");
