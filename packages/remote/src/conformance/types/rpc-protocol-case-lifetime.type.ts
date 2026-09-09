/**
 * @overview Private resource custody, operation attribution and task-settlement records for Protocol case lifetimes.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { RpcCaseOperationPhaseEnum } from "@/conformance/enums/rpc-case-operation-phase.enum";

export type Operation = {
	readonly resource: number;
	readonly phase: RpcCaseOperationPhaseEnum;
	readonly label: string;
	readonly order: number;
	failed: boolean;
	error: unknown;
};
export type RoleResource = {
	readonly index: number;
	readonly role: object;
	close: ((...args: never[]) => unknown) | undefined;
	cleanup: ((...args: never[]) => unknown) | undefined;
	closeAttempted: boolean;
	cleanupAttempted: boolean;
};
export type TaskResult =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: unknown };
export type TaskRecord = {
	readonly owner: Operation;
	disposal: boolean;
	result: TaskResult | undefined;
	settledAt: number | undefined;
	settlement: Promise<TaskResult>;
};
