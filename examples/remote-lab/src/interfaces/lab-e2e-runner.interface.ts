/**
 * @overview Defines the HTTP and lifetime boundary of the main Node E2E owner.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface ILabE2eRunner {
	handleRequest(request: IncomingMessage, response: ServerResponse): boolean;
	shutdown(): Promise<void>;
}
