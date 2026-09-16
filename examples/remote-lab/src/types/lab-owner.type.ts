/**
 * @overview Safe owner state and creation-configuration observations owned by the Lab.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import type { RpcConnectorReconnectionEvent } from "@husky-di/remote";
import type { LabCustomDefinition } from "@/types/lab-custom-services.type";
import type { LabConnectionObservation } from "@/types/lab-recording.type";

export type LabObservedState = {
	readonly status: string;
	readonly outcome?: string;
	readonly reason?: string;
	readonly error?: string;
	readonly attempt?: number;
	readonly nextAttempt?: number;
	readonly delayMs?: number;
};

export type LabOwnerConfiguration = {
	readonly name: string;
	readonly value: string;
	readonly source: string;
};

export type LabBrowserOwnerSnapshot = {
	readonly customDefinitions: readonly LabCustomDefinition[];
	readonly connections: readonly LabConnectionObservation[];
	readonly observedAt: number;
	readonly owner: LabObservedState;
	readonly peer: LabObservedState;
	readonly supervisor: LabObservedState;
	readonly reconnectionEvents: readonly (RpcConnectorReconnectionEvent & {
		readonly observedAt: number;
	})[];
	readonly configuration: readonly LabOwnerConfiguration[];
};
