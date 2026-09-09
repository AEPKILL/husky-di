/**
 * @overview Records Protocol case operation failures and inspects role capabilities without changing their receiver.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RpcCaseOperationException } from "@/conformance/exceptions/rpc-case-operation.exception";
import { assertRpcConformance } from "@/conformance/rpc-conformance.util";
import type {
	Operation,
	RoleResource,
	TaskRecord,
} from "@/conformance/types/rpc-protocol-case-lifetime.type";
import { isCallable, isNonNullObject } from "@/shared/utils/type-guard.util";

export function collectRpcCaseFailures(
	operations: readonly Operation[],
	primary: Operation | undefined,
): unknown[] {
	const remaining = operations
		.filter((operation) => operation.failed && operation !== primary)
		.sort(
			(left, right) =>
				left.resource - right.resource ||
				left.phase - right.phase ||
				left.order - right.order,
		);
	return (primary === undefined ? remaining : [primary, ...remaining]).map(
		(operation) => operation.error,
	);
}

export function performRpcCaseOperation<T>(
	operation: Operation,
	action: () => T,
): T {
	try {
		return action();
	} catch (error) {
		throw new RpcCaseOperationException(failRpcCaseOperation(operation, error));
	}
}

export function failRpcCaseOperation(
	operation: Operation,
	error: unknown,
): Operation {
	if (!operation.failed) {
		operation.failed = true;
		operation.error = error;
	}
	return operation;
}

export function readRpcCaseMethod(
	resource: RoleResource,
	member: "close" | "cleanup" | "shutdown" | "bind" | "accept",
	operation: Operation,
): (...args: never[]) => unknown {
	return performRpcCaseOperation(operation, () => {
		const method: unknown = Reflect.get(resource.role, member);
		assertRpcConformance(
			isCallable(method),
			`Protocol role is missing ${member}().`,
		);
		return method;
	});
}

export async function settleRpcCaseDisposalTasks(
	tasks: readonly TaskRecord[],
	deadline: number,
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		Promise.all(tasks.map((record) => record.settlement)),
		new Promise<void>((resolve) => {
			timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
		}),
	]);
	if (timer !== undefined) clearTimeout(timer);
	for (const task of tasks) {
		const result = task.result;
		if (
			result === undefined ||
			task.settledAt === undefined ||
			task.settledAt >= deadline
		) {
			failRpcCaseOperation(
				task.owner,
				new Error(
					`${task.owner.label} did not settle before the disposal deadline.`,
				),
			);
		} else if (!result.ok) {
			// Cleanup may already have settled between the work cutoff and seal,
			// or reuse a task first returned by a handoff. Keep that settlement.
			failRpcCaseOperation(task.owner, result.error);
		}
	}
}

export function trackRpcCaseTask(
	registry: Map<Promise<unknown>, TaskRecord>,
	task: Promise<unknown>,
	owner: Operation,
	disposal: boolean,
	admitsSettlement: (record: TaskRecord) => boolean,
): TaskRecord {
	const existing = registry.get(task);
	if (existing !== undefined) {
		existing.disposal ||= disposal;
		return existing;
	}
	performRpcCaseOperation(owner, () =>
		assertRpcConformance(
			isNonNullObject(task) && isCallable(Reflect.get(task, "then")),
			"Protocol operation did not return a task.",
		),
	);
	const record: TaskRecord = {
		owner,
		disposal,
		result: undefined,
		settledAt: undefined,
		settlement: Promise.resolve({ ok: true, value: undefined }),
	};
	registry.set(task, record);
	record.settlement = Promise.resolve(task).then(
		(value) => {
			const result = { ok: true, value } as const;
			record.result = result;
			record.settledAt = Date.now();
			return result;
		},
		(error: unknown) => {
			const result = { ok: false, error } as const;
			record.result = result;
			record.settledAt = Date.now();
			if (admitsSettlement(record)) {
				failRpcCaseOperation(owner, error);
			}
			return result;
		},
	);
	return record;
}
