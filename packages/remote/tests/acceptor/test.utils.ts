/**
 * @overview Shared acceptor-cleanup fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import { createServiceIdentifier } from "@husky-di/core";

export const IFaultingService =
	createServiceIdentifier<FaultingService>("IFaultingService");

interface FaultingService {
	run(): Promise<void>;
}
