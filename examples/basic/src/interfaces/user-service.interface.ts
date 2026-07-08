/**
 * User service interface for the basic example.
 *
 * @overview
 * Defines the application-facing service contract exposed by the example.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IUserService {
	getUserSummary(id: string): string;
}

export const IUserService =
	createServiceIdentifier<IUserService>("IUserService");
