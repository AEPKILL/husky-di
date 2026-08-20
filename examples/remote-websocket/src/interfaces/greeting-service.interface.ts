/**
 * @overview Greeting service contract shared by both ends of the WebSocket example.
 * @author AEPKILL
 * @created 2026-08-20 23:09:54
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IGreetingService {
	greet(name: string, delayMs: number): Promise<string>;
}

export const IGreetingService =
	createServiceIdentifier<IGreetingService>("IGreetingService");
