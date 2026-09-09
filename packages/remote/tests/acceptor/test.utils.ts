/**
 * @overview Shared acceptor-cleanup fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";

export const IFaultingService =
	createServiceIdentifier<FaultingService>("IFaultingService");

interface FaultingService {
	run(): Promise<void>;
}
