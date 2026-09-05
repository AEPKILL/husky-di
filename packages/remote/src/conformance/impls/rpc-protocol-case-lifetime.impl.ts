/**
 * @overview Own one Protocol case's acquisitions, work authority, tasks and disposal.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type {
	IRpcProtocolCaseLifetime,
	IRpcProtocolCaseScope,
} from "@/conformance/interfaces/rpc-protocol-case-lifetime.interface";
import type { RpcProtocolConformanceCandidate } from "@/conformance/rpc-conformance.type";
import { assertRpcConformance } from "@/conformance/rpc-conformance.util";
import {
	createSessionHostProbe,
	createTrackedTransport,
} from "@/conformance/rpc-protocol-case.util";
import type {
	ProtocolPair,
	TrackedProtocolTransport,
} from "@/conformance/types/rpc-protocol-case.type";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import { isCallable, isNonNullObject } from "@/utils/type-guard.util";

export class RpcProtocolCaseLifetimeImpl
	implements IRpcProtocolCaseLifetime, IRpcProtocolCaseScope
{
	#phase: "unused" | "work" | "disposal" | "finished" = "unused";
	#candidate: RpcProtocolConformanceCandidate | undefined;
	#deadline = 0;
	#disposalDeadline = 0;
	#nextResource = 0;
	#operations: Operation[] = [];
	#resources = new Map<object, RoleResource>();
	#tasks = new Map<Promise<unknown>, TaskRecord>();
	#transports: Array<{
		readonly index: number;
		readonly transport: TrackedProtocolTransport;
	}> = [];
	#controller = new AbortController();
	#primary: Operation | undefined;
	#timeout: Operation | undefined;

	async run(
		candidate: RpcProtocolConformanceCandidate,
		work: (scope: IRpcProtocolCaseScope) => void | Promise<void>,
	): Promise<void> {
		if (this.#phase !== "unused")
			throw new Error("A Protocol case lifetime can run only once.");
		this.#candidate = candidate;
		this.#phase = "work";
		this.#deadline = Date.now() + CASE_TIMEOUT_MS;
		const settled = Promise.withResolvers<void>();
		const seal = (failure?: Operation) => {
			if (this.#phase !== "work") return;
			this.#primary = failure;
			this.#phase = "disposal";
			this.#disposalDeadline = Date.now() + CASE_TIMEOUT_MS;
			settled.resolve();
		};
		const timer = setTimeout(() => seal(this.#workTimeout()), CASE_TIMEOUT_MS);
		void Promise.resolve()
			.then(() => work(this))
			.then(
				() =>
					seal(Date.now() >= this.#deadline ? this.#workTimeout() : undefined),
				(error: unknown) => {
					if (this.#phase !== "work") return;
					const failure =
						error instanceof OperationFailure
							? error.operation
							: this.#fail(this.#operation(-1, 1), error);
					seal(Date.now() >= this.#deadline ? this.#workTimeout() : failure);
				},
			);
		await settled.promise;
		clearTimeout(timer);
		await this.#dispose();
		this.#phase = "finished";
		const remaining = this.#operations
			.filter((operation) => operation.failed && operation !== this.#primary)
			.sort(
				(left, right) =>
					left.resource - right.resource ||
					left.phase - right.phase ||
					left.order - right.order,
			);
		const failures = (
			this.#primary === undefined ? remaining : [this.#primary, ...remaining]
		).map((operation) => operation.error);
		// Late task consumers keep only their own settlement record and sealed authority.
		this.#candidate = undefined;
		this.#resources.clear();
		this.#transports.length = 0;
		this.#tasks.clear();
		this.#operations = [];
		this.#primary = undefined;
		this.#timeout = undefined;
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(
				failures,
				"Protocol case work or disposal failed.",
			);
	}

	createRole(
		kind: "connector",
		host: IRpcProtocolConnectorHost,
	): IRpcProtocolConnector;
	createRole(
		kind: "acceptor",
		host: IRpcProtocolAcceptorHost,
	): IRpcProtocolAcceptor;
	createRole(
		kind: "connector" | "acceptor",
		host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
	): IRpcProtocolConnector | IRpcProtocolAcceptor {
		this.#assertWork();
		const index = this.#nextResource++;
		const operation = this.#operation(index, 1, `${kind} construction`);
		const candidate = this.#candidate;
		assertRpcConformance(
			candidate !== undefined,
			"Protocol case has no candidate.",
		);
		const role = this.#perform(operation, () =>
			kind === "connector"
				? candidate.connector(
						this.#guardHost(host as IRpcProtocolConnectorHost),
					)
				: candidate.acceptor(this.#guardHost(host as IRpcProtocolAcceptorHost)),
		);
		if (!isNonNullObject(role))
			throw new OperationFailure(
				this.#fail(
					operation,
					new Error("Protocol factory must return a role."),
				),
			);
		let resource = this.#resources.get(role);
		if (resource === undefined) {
			resource = {
				index,
				role,
				close: undefined,
				cleanup: undefined,
				closeAttempted: false,
				cleanupAttempted: false,
			};
			this.#resources.set(role, resource);
			for (const member of ["close", "cleanup"] as const) {
				try {
					resource[member] = this.#readMethod(
						resource,
						member,
						this.#operation(index, 0, `${member} capability`),
					);
				} catch {
					/* Capture capabilities independently before propagating their failure. */
				}
			}
		}
		const invalidCapability = this.#operations.find(
			(entry) =>
				entry.resource === resource.index && entry.phase === 0 && entry.failed,
		);
		if (invalidCapability !== undefined)
			throw new OperationFailure(invalidCapability);
		this.#readMethod(
			resource,
			"shutdown",
			this.#operation(index, 1, "shutdown capability"),
		);
		this.#readMethod(
			resource,
			kind === "connector" ? "bind" : "accept",
			this.#operation(index, 1, `${kind} handoff capability`),
		);
		this.#assertWork();
		return role;
	}

	async openPair(): Promise<ProtocolPair> {
		this.#assertWork();
		const active = () => this.#phase === "work" && Date.now() < this.#deadline;
		const connectorProbe = createSessionHostProbe("connector", active);
		const acceptorProbe = createSessionHostProbe("acceptor", active);
		const connector = this.createRole("connector", connectorProbe.host);
		const acceptor = this.createRole("acceptor", acceptorProbe.host);
		const transport = createTrackedTransport(active);
		this.#transports.push({ index: this.#nextResource++, transport });
		let acceptance: Promise<void>;
		transport.acceptorHandoff = true;
		try {
			acceptance = this.#handoff(
				acceptor,
				"accept",
				transport.acceptorConnection,
			);
		} finally {
			transport.acceptorHandoff = false;
		}
		assertRpcConformance(
			transport.acceptorSubscriptions === 1,
			"accept() did not subscribe synchronously.",
		);
		let binding: Promise<void>;
		transport.connectorHandoff = true;
		try {
			binding = this.#handoff(connector, "bind", transport.connectorConnection);
		} finally {
			transport.connectorHandoff = false;
		}
		assertRpcConformance(
			transport.connectorSubscriptions === 1,
			"bind() did not subscribe synchronously.",
		);
		await Promise.all([
			this.waitForTask(acceptance, "Protocol acceptance"),
			this.waitForTask(binding, "Protocol binding"),
		]);
		this.#assertWork();
		assertRpcConformance(
			connectorProbe.session !== undefined &&
				acceptorProbe.session !== undefined,
			"Protocol handoff did not install both Sessions.",
		);
		return {
			connector,
			acceptor,
			connectorProbe,
			acceptorProbe,
			connectorSession: connectorProbe.session,
			transport,
		};
	}

	close(role: IRpcProtocolConnector | IRpcProtocolAcceptor): void {
		this.#assertWork();
		this.#invoke(this.#resource(role), "close", false);
	}

	cleanup(role: IRpcProtocolConnector | IRpcProtocolAcceptor): Promise<void> {
		this.#assertWork();
		return this.#invoke(
			this.#resource(role),
			"cleanup",
			false,
		) as Promise<void>;
	}

	async waitFor(predicate: () => boolean, operation: string): Promise<void> {
		this.#assertWork();
		const observation = this.#operation(-1, 1, operation);
		for (;;) {
			this.#assertWork();
			if (this.#perform(observation, predicate)) return;
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
	}

	async waitForTask<T>(task: Promise<T>, operation: string): Promise<T> {
		// The caller evaluates its raw operation before entering this scope method.
		// Even an overdue or sealed scope must consume that already-created task.
		void Promise.resolve(task).catch(() => undefined);
		this.#assertWork();
		const record =
			this.#tasks.get(task) ??
			this.#track(task, this.#operation(-1, 1, operation), false);
		const result = await record.settlement;
		this.#assertWork();
		if (!result.ok) throw new OperationFailure(record.owner);
		return result.value as T;
	}

	#assertWork(): void {
		if (this.#phase !== "work")
			throw new Error("Protocol case work is sealed.");
		if (Date.now() >= this.#deadline)
			throw new OperationFailure(this.#workTimeout());
	}

	#guardHost<T extends IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost>(
		host: T,
	): T {
		return new Proxy(host, {
			get: (target, key, receiver) => {
				const value: unknown = Reflect.get(target, key, receiver);
				if (!isCallable(value)) return value;
				return (...args: unknown[]) => {
					if (this.#phase !== "work" || Date.now() >= this.#deadline)
						return undefined;
					return Reflect.apply(value, target, args);
				};
			},
		});
	}

	#resource(role: object): RoleResource {
		const resource = this.#resources.get(role);
		assertRpcConformance(
			resource !== undefined,
			"Protocol role is outside this case lifetime.",
		);
		return resource;
	}

	#handoff(
		role: object,
		member: "accept" | "bind",
		connection: IRpcConnection,
	): Promise<void> {
		this.#assertWork();
		const resource = this.#resource(role);
		const method = this.#readMethod(
			resource,
			member,
			this.#operation(resource.index, 1, `${member} access`),
		);
		const operation = this.#operation(resource.index, 1, `Protocol ${member}`);
		const task = this.#perform(
			operation,
			() =>
				Reflect.apply(method, role, [
					connection,
					this.#controller.signal,
				]) as Promise<void>,
		);
		this.#track(task, operation, false);
		return task;
	}

	#readMethod(
		resource: RoleResource,
		member: "close" | "cleanup" | "shutdown" | "bind" | "accept",
		operation: Operation,
	): (...args: never[]) => unknown {
		return this.#perform(operation, () => {
			const method: unknown = Reflect.get(resource.role, member);
			assertRpcConformance(
				isCallable(method),
				`Protocol role is missing ${member}().`,
			);
			return method;
		});
	}

	#invoke(
		resource: RoleResource,
		member: "close" | "cleanup",
		fallback: boolean,
	): unknown {
		const phase = member === "close" ? 2 : 3;
		const method = fallback
			? resource[member]
			: this.#readMethod(
					resource,
					member,
					this.#operation(
						resource.index,
						phase,
						`${member} ${fallback ? "fallback" : "observation"}`,
					),
				);
		if (method === undefined) return undefined;
		const operation = this.#operation(
			resource.index,
			phase,
			`${member} ${fallback ? "fallback" : "observation"}`,
		);
		if (member === "close") resource.closeAttempted = true;
		else resource.cleanupAttempted = true;
		const result = this.#perform(operation, () =>
			Reflect.apply(method, resource.role, []),
		);
		if (member === "cleanup" || isNonNullObject(result))
			this.#track(result as Promise<void>, operation, true);
		return result;
	}

	#track(
		task: Promise<unknown>,
		owner: Operation,
		disposal: boolean,
	): TaskRecord {
		const existing = this.#tasks.get(task);
		if (existing !== undefined) {
			existing.disposal ||= disposal;
			return existing;
		}
		this.#perform(owner, () =>
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
		this.#tasks.set(task, record);
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
				if (this.#admitsSettlement(record)) {
					this.#fail(owner, error);
				}
				return result;
			},
		);
		return record;
	}

	#admitsSettlement(record: TaskRecord): boolean {
		return (
			(this.#phase === "work" && Date.now() < this.#deadline) ||
			(record.disposal &&
				this.#phase === "disposal" &&
				Date.now() < this.#disposalDeadline)
		);
	}

	async #dispose(): Promise<void> {
		const deadline = this.#disposalDeadline;
		this.#controller.abort();
		for (const resource of this.#resources.values()) {
			if (resource.closeAttempted) continue;
			try {
				this.#invoke(resource, "close", true);
			} catch {
				/* Recorded by its operation. */
			}
		}
		for (const { index, transport } of this.#transports) {
			const operation = this.#operation(index, 2);
			try {
				this.#track(
					this.#perform(operation, () => transport.connectorConnection.close()),
					operation,
					true,
				);
			} catch {
				/* Recorded by its operation. */
			}
		}
		for (const resource of this.#resources.values()) {
			if (resource.cleanupAttempted) continue;
			try {
				this.#invoke(resource, "cleanup", true);
			} catch {
				/* Recorded by its operation. */
			}
		}
		const tasks = [...this.#tasks.values()].filter((record) => record.disposal);
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
				this.#fail(
					task.owner,
					new Error(
						`${task.owner.label} did not settle before the disposal deadline.`,
					),
				);
			} else if (!result.ok) {
				// Cleanup may already have settled between the work cutoff and seal,
				// or reuse a task first returned by a handoff. Keep that settlement.
				this.#fail(task.owner, result.error);
			}
		}
	}

	#operation(
		resource: number,
		phase: number,
		label = "Protocol case operation",
	): Operation {
		const operation: Operation = {
			resource,
			phase,
			label,
			order: this.#operations.length,
			failed: false,
			error: undefined,
		};
		this.#operations.push(operation);
		return operation;
	}

	#perform<T>(operation: Operation, action: () => T): T {
		try {
			return action();
		} catch (error) {
			throw new OperationFailure(this.#fail(operation, error));
		}
	}

	#fail(operation: Operation, error: unknown): Operation {
		if (!operation.failed) {
			operation.failed = true;
			operation.error = error;
		}
		return operation;
	}

	#workTimeout(): Operation {
		this.#timeout ??= this.#fail(
			this.#operation(-1, 1),
			new Error("Protocol case work did not settle before its deadline."),
		);
		return this.#timeout;
	}
}

type Operation = {
	readonly resource: number;
	readonly phase: number;
	readonly label: string;
	readonly order: number;
	failed: boolean;
	error: unknown;
};
type RoleResource = {
	readonly index: number;
	readonly role: object;
	close: ((...args: never[]) => unknown) | undefined;
	cleanup: ((...args: never[]) => unknown) | undefined;
	closeAttempted: boolean;
	cleanupAttempted: boolean;
};
type TaskResult =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: unknown };
type TaskRecord = {
	readonly owner: Operation;
	disposal: boolean;
	result: TaskResult | undefined;
	settledAt: number | undefined;
	settlement: Promise<TaskResult>;
};

const CASE_TIMEOUT_MS = 2_000;

class OperationFailure extends Error {
	constructor(readonly operation: Operation) {
		super("Protocol case operation failed.");
	}
}
