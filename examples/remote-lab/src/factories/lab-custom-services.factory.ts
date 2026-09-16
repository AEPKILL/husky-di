/**
 * @overview Owns form-defined exposures and fixed-peer facades while recording actual Remote outcomes.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	createRemoteServiceDescriptor,
	type IRpcPeer,
	RpcCallDirectionEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { LAB_SERVICE_NAMES } from "@/consts/lab-services.const";
import {
	LabCustomActionEnum,
	LabCustomBehaviorEnum,
	LabCustomFailureEnum,
	LabCustomScopeEnum,
} from "@/enums/lab-custom-services.enum";
import {
	LabCallOutcomeEnum,
	type LabSideEnum,
} from "@/enums/lab-recording.enum";
import type {
	ILabCustomServices,
	ILabCustomTargets,
} from "@/interfaces/lab-custom-services.interface";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type { ILabTraceContext } from "@/interfaces/lab-trace-context.interface";
import type {
	LabCustomCall,
	LabCustomCatalog,
	LabCustomCommand,
	LabCustomCommandResult,
	LabCustomDefinition,
	LabCustomDefinitionInput,
	LabCustomFacade,
	LabCustomFacadeInput,
	LabCustomMethod,
	LabCustomSnapshot,
	LabCustomTarget,
} from "@/types/lab-custom-services.type";

export type CreateLabCustomServicesOptions = {
	readonly instanceId: string;
	readonly side: LabSideEnum;
	readonly recorder: ILabRecorder;
	readonly traceContext: ILabTraceContext;
	readonly targets: ILabCustomTargets;
};

export function createLabCustomServices({
	instanceId,
	side,
	recorder,
	traceContext,
	targets,
}: CreateLabCustomServicesOptions): ILabCustomServices {
	const definitions = new Map<string, DefinitionEntry>();
	const facades = new Map<string, FacadeEntry>();
	const calls = new Map<string, CallEntry>();
	const catalogs = new Map<string, LabCustomCatalog>();
	const operations = new Map<
		string,
		Omit<LabCustomCommandResult, "snapshot">
	>();
	let revision = 0;
	let observation = 0;
	let untrackedOrdinal = 0;

	function snapshot(): LabCustomSnapshot {
		for (const [id, catalog] of catalogs)
			if (!targets.peer(catalog.target)) catalogs.delete(id);
		const observations = recorder.snapshot().calls;
		const customCalls: LabCustomCall[] = [];
		for (const [id, call] of calls) {
			const observed = observations.find(
				(entry) =>
					entry.traceId === id &&
					entry.direction === RpcCallDirectionEnum.outgoing,
			);
			if (!observed) {
				calls.delete(id);
				continue;
			}
			customCalls.push({
				...call.metadata,
				outcome: observed.outcome,
				result: observed.result,
				elapsedMs: (observed.finishedAt ?? Date.now()) - observed.startedAt,
			});
		}
		return {
			instanceId,
			observation: ++observation,
			observedAt: Date.now(),
			revision,
			definitions: [...definitions.values()].map((entry) => {
				if (entry.owner?.state.status === RpcStateStatusEnum.closed)
					entry.cleanup = undefined;
				return {
					...structuredClone(entry.definition),
					exposed: entry.cleanup !== undefined,
					targetValid: targets.exposure(entry.definition.target) !== undefined,
				};
			}),
			facades: [...facades.values()].map((entry) => ({
				...structuredClone(entry.metadata),
				targetValid:
					targets.peer(entry.metadata.target) === entry.peer &&
					entry.peer.state.status !== RpcStateStatusEnum.closed,
			})),
			calls: customCalls.reverse(),
			catalogs: [...catalogs.values()]
				.filter((catalog) => targets.peer(catalog.target) !== undefined)
				.map((catalog) => structuredClone(catalog)),
		};
	}

	function findDefinition(
		id: string,
		expectedRevision: number,
	): DefinitionEntry {
		const entry = definitions.get(id);
		if (!entry) throw LabCustomFailureEnum.missing;
		if (entry.definition.revision !== expectedRevision)
			throw LabCustomFailureEnum.staleRevision;
		if (entry.owner?.state.status === RpcStateStatusEnum.closed)
			entry.cleanup = undefined;
		return entry;
	}

	function changed(entry: DefinitionEntry): void {
		entry.definition = {
			...entry.definition,
			revision: entry.definition.revision + 1,
		};
		revision += 1;
	}

	function apply(command: LabCustomCommand): string | undefined {
		if (command.instanceId !== instanceId)
			throw LabCustomFailureEnum.staleInstance;
		switch (command.action) {
			case LabCustomActionEnum.save: {
				const existing =
					command.id === undefined
						? undefined
						: findDefinition(command.id, command.revision ?? -1);
				if (existing?.cleanup) throw LabCustomFailureEnum.exposed;
				const definition = validateDefinition(command.definition);
				if (!targets.exposure(definition.target))
					throw LabCustomFailureEnum.targetUnavailable;
				const id = command.id ?? crypto.randomUUID();
				definitions.set(id, {
					definition: {
						...definition,
						id,
						revision: (existing?.definition.revision ?? 0) + 1,
						exposed: false,
						targetValid: true,
					},
				});
				revision += 1;
				return id;
			}
			case LabCustomActionEnum.expose: {
				const entry = findDefinition(command.id, command.revision);
				if (entry.cleanup) return entry.definition.id;
				const owner = targets.exposure(entry.definition.target);
				if (!owner) throw LabCustomFailureEnum.targetUnavailable;
				if (RESERVED_SERVICE_NAMES.has(entry.definition.wireName))
					throw LabCustomFailureEnum.conflict;
				const implementation = Object.create(null) as DynamicService;
				for (const method of entry.definition.methods) {
					const value =
						method.behavior === LabCustomBehaviorEnum.fixed
							? JSON.parse(method.valueJson)
							: null;
					implementation[method.name] = (args, signal) => {
						const traceId =
							traceContext.get() ?? `untracked-${++untrackedOrdinal}`;
						if (!Array.isArray(args))
							throw new TypeError("Invalid Lab correlation envelope.");
						return recorder.run(
							{
								traceId,
								peerId: entry.definition.target.peerId ?? "acceptor",
								side,
								direction: RpcCallDirectionEnum.incoming,
								service: entry.definition.wireName,
								method: method.name,
							},
							args,
							async () => {
								await wait(
									method.delayMs,
									method.cancelable
										? (signal as AbortSignal | undefined)
										: undefined,
								);
								if (method.behavior === LabCustomBehaviorEnum.throw)
									throw new Error("Intentional Lab handler failure.");
								return method.behavior === LabCustomBehaviorEnum.echo
									? args
									: structuredClone(value);
							},
						);
					};
				}
				try {
					entry.cleanup = owner.expose(
						descriptor(entry.definition),
						implementation,
					);
				} catch {
					throw LabCustomFailureEnum.conflict;
				}
				entry.owner = owner;
				changed(entry);
				return entry.definition.id;
			}
			case LabCustomActionEnum.revoke: {
				const entry = findDefinition(command.id, command.revision);
				entry.cleanup?.();
				entry.cleanup = undefined;
				changed(entry);
				return entry.definition.id;
			}
			case LabCustomActionEnum.remove: {
				const entry = findDefinition(command.id, command.revision);
				if (entry.cleanup) throw LabCustomFailureEnum.exposed;
				definitions.delete(command.id);
				revision += 1;
				return command.id;
			}
			case LabCustomActionEnum.reset: {
				validateTarget(command.target);
				if (command.revision !== revision)
					throw LabCustomFailureEnum.staleRevision;
				for (const [id, entry] of definitions) {
					if (!sameTarget(entry.definition.target, command.target)) continue;
					entry.cleanup?.();
					definitions.delete(id);
				}
				revision += 1;
				return undefined;
			}
			case LabCustomActionEnum.resolve: {
				validateTarget(command.facade.target);
				const serviceDescriptor = descriptor(command.facade);
				const peer = targets.peer(command.facade.target);
				if (!peer) throw LabCustomFailureEnum.targetUnavailable;
				const id = crypto.randomUUID();
				facades.set(id, {
					metadata: {
						...structuredClone(command.facade),
						id,
						targetValid: true,
					},
					peer,
					service: peer.resolve(serviceDescriptor) as unknown as DynamicFacade,
				});
				return id;
			}
			case LabCustomActionEnum.call: {
				const entry = facades.get(command.facadeId);
				if (!entry) throw LabCustomFailureEnum.missing;
				const method = entry.metadata.methods.find(
					(method) => method.name === command.method,
				);
				if (!method || typeof command.argsJson !== "string")
					throw LabCustomFailureEnum.validation;
				const args: unknown = JSON.parse(command.argsJson);
				if (!Array.isArray(args)) throw LabCustomFailureEnum.validation;
				const id = `${instanceId}:${crypto.randomUUID()}`;
				const controller = new AbortController();
				calls.set(id, {
					controller,
					metadata: {
						id,
						traceId: id,
						facadeId: command.facadeId,
						target: structuredClone(entry.metadata.target),
						wireName: entry.metadata.wireName,
						method: method.name,
						cancelable: method.cancelable,
						startedAt: Date.now(),
						elapsedMs: 0,
						outcome: LabCallOutcomeEnum.pending,
					},
				});
				void recorder
					.run(
						{
							traceId: id,
							peerId: entry.metadata.target.peerId ?? "acceptor",
							side,
							direction: RpcCallDirectionEnum.outgoing,
							service: entry.metadata.wireName,
							method: method.name,
						},
						args,
						() => {
							const invoke = entry.service[method.name];
							return method.cancelable
								? traceContext.run(id, () => invoke(args, controller.signal))
								: traceContext.run(id, () => invoke(args));
						},
					)
					.catch(() => {
						/* The recorder owns the caller's safe terminal outcome. */
					});
				return id;
			}
			case LabCustomActionEnum.cancel: {
				const call = calls.get(command.callId);
				if (!call) throw LabCustomFailureEnum.missing;
				if (!call.metadata.cancelable) throw LabCustomFailureEnum.validation;
				call.controller.abort();
				return command.callId;
			}
			case LabCustomActionEnum.advertise: {
				const catalog = command.catalog;
				validateTarget(catalog.target);
				if (
					catalog.target.scope !== LabCustomScopeEnum.browserPeer ||
					!targets.peer(catalog.target)
				)
					throw LabCustomFailureEnum.targetUnavailable;
				if (!Array.isArray(catalog.definitions))
					throw LabCustomFailureEnum.validation;
				const projected = catalog.definitions.map((definition) => {
					descriptor({ ...definition, target: catalog.target });
					if (
						typeof definition.id !== "string" ||
						!Number.isSafeInteger(definition.revision) ||
						typeof definition.exposed !== "boolean"
					)
						throw LabCustomFailureEnum.validation;
					return {
						id: definition.id,
						revision: definition.revision,
						wireName: definition.wireName,
						exposed: definition.exposed,
						methods: definition.methods.map(
							({
								name,
								cancelable,
							}: Pick<LabCustomMethod, "name" | "cancelable">) => ({
								name,
								cancelable,
							}),
						),
					};
				});
				catalogs.set(catalog.target.peerId ?? "", {
					target: structuredClone(catalog.target),
					definitions: projected,
				});
				return undefined;
			}
			default:
				throw LabCustomFailureEnum.validation;
		}
	}

	return {
		snapshot,
		execute(command) {
			const requestId = command?.requestId;
			if (
				typeof requestId !== "string" ||
				requestId.length === 0 ||
				requestId.length > 160
			)
				return {
					requestId: "",
					ok: false,
					error: LabCustomFailureEnum.validation,
					snapshot: snapshot(),
				};
			if (command.instanceId !== instanceId)
				return {
					requestId,
					ok: false,
					error: LabCustomFailureEnum.staleInstance,
					snapshot: snapshot(),
				};
			const prior = operations.get(requestId);
			if (prior) return { ...prior, snapshot: snapshot() };
			let result: Omit<LabCustomCommandResult, "snapshot">;
			try {
				result = { requestId, ok: true, id: apply(command) };
			} catch (error) {
				result = {
					requestId,
					ok: false,
					error: Object.values(LabCustomFailureEnum).includes(
						error as LabCustomFailureEnum,
					)
						? (error as LabCustomFailureEnum)
						: LabCustomFailureEnum.validation,
				};
			}
			operations.set(requestId, result);
			if (operations.size > 100)
				operations.delete(operations.keys().next().value ?? "");
			return { ...result, snapshot: snapshot() };
		},
		operation(requestId) {
			const operation = operations.get(requestId);
			return operation ? { ...operation, snapshot: snapshot() } : undefined;
		},
	};
}

type DynamicService = Record<
	string,
	(...args: readonly unknown[]) => Promise<unknown>
>;
type DynamicFacade = Record<
	string,
	(args: readonly unknown[], signal?: AbortSignal) => Promise<unknown>
>;
type DefinitionEntry = {
	definition: LabCustomDefinition;
	cleanup?: () => void;
	owner?: ReturnType<ILabCustomTargets["exposure"]>;
};
type FacadeEntry = {
	readonly metadata: LabCustomFacade;
	readonly peer: IRpcPeer;
	readonly service: DynamicFacade;
};
type CallEntry = {
	readonly metadata: LabCustomCall;
	readonly controller: AbortController;
};

const RESERVED_SERVICE_NAMES = new Set<string>([
	...Object.values(LAB_SERVICE_NAMES),
	"example.greeting.v1",
	"example.browser-display.v1",
]);

function descriptor(input: LabCustomFacadeInput) {
	if (!Array.isArray(input.methods) || input.methods.length === 0)
		throw LabCustomFailureEnum.validation;
	const members = Object.create(null) as Record<
		string,
		{ readonly kind: "function"; readonly cancelable?: true }
	>;
	const names = new Set<string>();
	for (const method of input.methods) {
		if (
			typeof method.name !== "string" ||
			names.has(method.name) ||
			typeof method.cancelable !== "boolean"
		)
			throw LabCustomFailureEnum.validation;
		names.add(method.name);
		// This runtime form can mix both method conventions; the public descriptor validates the actual allowlist.
		Object.defineProperty(members, method.name, {
			enumerable: true,
			value: method.cancelable
				? { kind: "function", cancelable: true }
				: { kind: "function" },
		});
	}
	return createRemoteServiceDescriptor(
		createServiceIdentifier<DynamicService>("Lab custom service"),
		{ wireName: input.wireName, members },
	);
}

function validateTarget(target: LabCustomTarget): void {
	if (
		!target ||
		!Object.values(LabCustomScopeEnum).includes(target.scope) ||
		typeof target.instanceId !== "string" ||
		target.instanceId.length === 0 ||
		(target.scope !== LabCustomScopeEnum.nodeGlobal &&
			(typeof target.peerId !== "string" || target.peerId.length === 0)) ||
		(target.scope === LabCustomScopeEnum.nodeGlobal &&
			target.peerId !== undefined)
	)
		throw LabCustomFailureEnum.validation;
}

function validateDefinition(
	input: LabCustomDefinitionInput,
): LabCustomDefinitionInput {
	validateTarget(input.target);
	descriptor(input);
	for (const method of input.methods) {
		if (
			!Object.values(LabCustomBehaviorEnum).includes(method.behavior) ||
			!Number.isSafeInteger(method.delayMs) ||
			method.delayMs < 0 ||
			method.delayMs > 10_000 ||
			typeof method.valueJson !== "string"
		)
			throw LabCustomFailureEnum.validation;
		if (method.behavior === LabCustomBehaviorEnum.fixed)
			JSON.parse(method.valueJson);
	}
	return structuredClone(input);
}

function sameTarget(left: LabCustomTarget, right: LabCustomTarget): boolean {
	return (
		left.scope === right.scope &&
		left.instanceId === right.instanceId &&
		left.peerId === right.peerId
	);
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Canceled Lab handler."));
			return;
		}
		const timer = globalThis.setTimeout(() => {
			signal?.removeEventListener("abort", abort);
			resolve();
		}, delayMs);
		function abort() {
			globalThis.clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			reject(new Error("Canceled Lab handler."));
		}
		signal?.addEventListener("abort", abort, { once: true });
	});
}
