/**
 * @overview Shares the built-in business service contract between real Node and Chromium peers.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createServiceIdentifier } from "@husky-di/core";
import { createRemoteServiceDescriptor } from "@husky-di/remote";
import type { Observable } from "rxjs";

export interface IService {
	echo(value: unknown): unknown;
	fail(): never;
	held(key: string, signal: AbortSignal): Promise<{ aborted: boolean }>;
	resume(key: string): boolean;
	readonly changes: Observable<number>;
	delayed(
		ms: number,
		signal: AbortSignal,
	): Promise<{ entries: number; aborted: boolean }>;
	callback(index: number, message: string): Promise<string>;
	values(count: number): Observable<number>;
}

export const SERVICE = createRemoteServiceDescriptor(
	createServiceIdentifier<IService>("LabBuiltInService"),
	{
		wireName: "lab.platform.service.v1",
		members: {
			echo: { kind: "function" },
			fail: { kind: "function" },
			held: { kind: "function", cancelable: true },
			resume: { kind: "function" },
			changes: { kind: "observable" },
			delayed: { kind: "function", cancelable: true },
			callback: { kind: "function" },
			values: { kind: "observable-function" },
		},
	},
);
export const CALLBACK = createRemoteServiceDescriptor(
	createServiceIdentifier<{ receive(message: string): string }>(
		"LabBuiltInCallback",
	),
	{
		wireName: "lab.platform.callback.v1",
		members: { receive: { kind: "function" } },
	},
);
export const SHIPPING = createRemoteServiceDescriptor(
	createServiceIdentifier<{
		quote(
			from: string,
			to: string,
			kg: number,
		): {
			from: string;
			to: string;
			kg: number;
			amount: number;
			currency: string;
		};
	}>("LabShipping"),
	{ wireName: "example.shipping.v1", members: { quote: { kind: "function" } } },
);
export const INSPECTION = createRemoteServiceDescriptor(
	createServiceIdentifier<{ inspect(): string }>("LabPeerInspection"),
	{
		wireName: "example.peer-inspection.v1",
		members: { inspect: { kind: "function" } },
	},
);
export const MISSING_METHOD = createRemoteServiceDescriptor(
	createServiceIdentifier<{ missing(): string }>("LabMissingMethod"),
	{
		wireName: "lab.platform.service.v1",
		members: { missing: { kind: "function" } },
	},
);
export const POLICY = {
	recoveryGraceMs: 1000,
	bindingAttemptTimeoutMs: 200,
	shutdownDeadlineMs: 1500,
};
