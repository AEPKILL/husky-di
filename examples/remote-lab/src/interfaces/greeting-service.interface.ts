/**
 * @overview Greeting service exposed by Node.
 * @author AEPKILL
 * @created 2026-08-21 01:06:59
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IGreetingService {
	ready(): Promise<string>;
	greet(name: string, delayMs: number): Promise<string>;
}

export const IGreetingService =
	createServiceIdentifier<IGreetingService>("GreetingService");
