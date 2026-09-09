/**
 * @overview Greeting service exposed by Node.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IGreetingService {
	ready(): Promise<string>;
	greet(name: string, delayMs: number): Promise<string>;
}

export const IGreetingService =
	createServiceIdentifier<IGreetingService>("GreetingService");
