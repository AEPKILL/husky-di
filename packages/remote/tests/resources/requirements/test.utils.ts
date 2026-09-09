/**
 * @overview Shared resources/protocol-requirements fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";

export interface IRequirementsService {
	run(value: string): number;
}

export interface IScheduledRequirementsService {
	run(value: string): Promise<string>;
}

export const IRequirementsService =
	createServiceIdentifier<IRequirementsService>("IRequirementsService");

export const IScheduledRequirementsService =
	createServiceIdentifier<IScheduledRequirementsService>(
		"IScheduledRequirementsService",
	);
