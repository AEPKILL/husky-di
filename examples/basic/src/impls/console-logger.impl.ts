/**
 * Console logger implementation for the basic example.
 *
 * @overview
 * Implements the logger contract by writing tagged messages to stdout.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import type { ILogger } from "@/interfaces/logger.interface";

export class ConsoleLoggerImpl implements ILogger {
	log(message: string): void {
		console.log(`[basic] ${message}`);
	}
}
