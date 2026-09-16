/**
 * @overview Exercises custom definitions through shared management and real Remote peers.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout } from "node:timers/promises";
import { RpcCallDirectionEnum, RpcStateStatusEnum } from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import {
	LAB_SERVICE_NAMES,
	REMOTE_LAB_SERVICE,
} from "../../src/consts/lab-services.const";
import {
	LabCustomActionEnum,
	LabCustomBehaviorEnum,
	LabCustomFailureEnum,
	LabCustomScopeEnum,
} from "../../src/enums/lab-custom-services.enum";
import { LabSideEnum } from "../../src/enums/lab-recording.enum";
import { createExampleClient } from "../../src/factories/example-client.factory";
import { createExampleServer } from "../../src/factories/example-server.factory";
import { createLabCustomServices } from "../../src/factories/lab-custom-services.factory";
import { createLabRecorder } from "../../src/factories/lab-recorder.factory";
import { createObservedConnectorAdapter } from "../../src/factories/observed-connector-adapter.factory";
import type { ILabCustomServices } from "../../src/interfaces/lab-custom-services.interface";
import type {
	LabCustomCommand,
	LabCustomCommandResult,
	LabCustomDefinitionInput,
	LabCustomSnapshot,
} from "../../src/types/lab-custom-services.type";
import type {
	LabClearResult,
	LabServerSnapshot,
} from "../../src/types/lab-server.type";
import { createLabTraceContext } from "../../src/utils/create-lab-trace-context.util";

describe("Custom Lab services", () => {
	it("EXAMPLE-LAB-CUSTOM-001/002 saves distinct exact-name definitions and rejects stale shared edits", async () => {
		const server = await createExampleServer({ port: 0 });
		try {
			const initial = await snapshot(server.origin);
			assert.equal(typeof initial.instanceId, "string");
			const observedAgain = await snapshot(server.origin);
			assert.ok(observedAgain.observation > initial.observation);
			assert.equal(observedAgain.revision, initial.revision);
			const lab = await labSnapshot(server.origin);
			assert.ok(
				lab.custom && lab.custom.observation > observedAgain.observation,
			);
			assert.equal(lab.custom.revision, initial.revision);
			const definition = {
				target: {
					scope: LabCustomScopeEnum.nodeGlobal,
					instanceId: initial.instanceId,
				},
				wireName: " custom-é ",
				methods: [
					{
						name: "__proto__",
						behavior: LabCustomBehaviorEnum.echo,
						valueJson: "null",
						delayMs: 0,
						cancelable: false,
					},
				],
			};
			const first = await command(server.origin, initial.instanceId, {
				action: LabCustomActionEnum.save,
				definition,
			});
			assert.equal(first.ok, true);
			assert.equal(first.snapshot.definitions[0].wireName, " custom-é ");
			assert.equal(first.snapshot.definitions[0].exposed, false);
			const second = await command(server.origin, initial.instanceId, {
				action: LabCustomActionEnum.save,
				definition,
			});
			assert.equal(second.snapshot.definitions.length, 2);
			const edit = await command(server.origin, initial.instanceId, {
				action: LabCustomActionEnum.save,
				id: first.id,
				revision: 1,
				definition: { ...definition, wireName: "renamed" },
			});
			assert.equal(edit.ok, true);
			const stale = await command(server.origin, initial.instanceId, {
				action: LabCustomActionEnum.save,
				id: first.id,
				revision: 1,
				definition,
			});
			assert.equal(stale.error, LabCustomFailureEnum.staleRevision);
			assert.equal(stale.snapshot.definitions[0].wireName, "renamed");
		} finally {
			await server.shutdown();
		}
	});

	it("EXAMPLE-LAB-CUSTOM-001 rejects form mistakes atomically while retaining exact and special names", async () => {
		const server = await createExampleServer({ port: 0 });
		try {
			const initial = await snapshot(server.origin);
			const definition = input(initial.instanceId);
			for (const invalid of [
				{ ...definition, wireName: "" },
				{ ...definition, methods: [] },
				{
					...definition,
					methods: [definition.methods[0], definition.methods[0]],
				},
				...["", "then"].map((name) => ({
					...definition,
					methods: [{ ...definition.methods[0], name }],
				})),
				...[-1, 10_001, 0.5].map((delayMs) => ({
					...definition,
					methods: [{ ...definition.methods[0], delayMs }],
				})),
				{
					...definition,
					methods: [
						{
							...definition.methods[0],
							behavior: LabCustomBehaviorEnum.fixed,
							valueJson: "{",
						},
					],
				},
			]) {
				const result = await command(server.origin, initial.instanceId, {
					action: LabCustomActionEnum.save,
					definition: invalid,
				});
				assert.equal(result.error, LabCustomFailureEnum.validation);
				assert.equal(result.snapshot.definitions.length, 0);
				assert.equal(result.snapshot.revision, 0);
			}
			const echo = await command(server.origin, initial.instanceId, {
				action: LabCustomActionEnum.save,
				definition: {
					...definition,
					methods: [
						{ ...definition.methods[0], valueJson: "ignored while echoing" },
					],
				},
			});
			assert.equal(echo.ok, true);
			assert.equal(
				(
					await command(server.origin, initial.instanceId, {
						action: LabCustomActionEnum.expose,
						id: echo.id,
						revision: 1,
					})
				).ok,
				true,
			);
			for (const wireName of [" leading ", "__proto__", "É", "E\u0301", "é"]) {
				const result = await command(server.origin, initial.instanceId, {
					action: LabCustomActionEnum.save,
					definition: {
						...definition,
						wireName,
						methods: [{ ...definition.methods[0], delayMs: 10_000 }],
					},
				});
				assert.equal(result.ok, true);
				assert.equal(result.snapshot.definitions.at(-1)?.wireName, wireName);
			}
		} finally {
			await server.shutdown();
		}
	});

	it("EXAMPLE-LAB-CUSTOM-002/003 exposes global and scoped services with real conflicts, retained facades and explicit traces", async () => {
		const server = await createExampleServer({ port: 0 });
		const first = await browser(server.origin);
		const second = await browser(server.origin);
		try {
			const definition = input(first.instanceId);
			const saved = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.save,
				definition,
			});
			const resolved = local(first.runtime, {
				action: LabCustomActionEnum.resolve,
				facade: { ...definition, target: first.nodeTarget },
			});
			const resolvedSecond = local(second.runtime, {
				action: LabCustomActionEnum.resolve,
				facade: { ...definition, target: second.nodeTarget },
			});
			assert.equal(resolved.ok, true);
			const absent = local(first.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: resolved.id,
				method: "echo",
				argsJson: "[]",
			});
			assert.equal(
				(await settled(first.runtime, absent.id)).outcome,
				"unknown-service",
			);
			const exposed = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.expose,
				id: saved.id,
				revision: 1,
			});
			assert.equal(exposed.ok, true);
			const called = local(first.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: resolved.id,
				method: "echo",
				argsJson: '["hello",{"__proto__":"data"}]',
			});
			const result = await settled(first.runtime, called.id);
			assert.equal(result.outcome, "fulfilled");
			assert.deepEqual(JSON.parse(result.result ?? "null"), [
				"hello",
				{ ["__proto__"]: "data" },
			]);
			const node = await labSnapshot(server.origin);
			const handler = node.recording.calls.find(
				(call) => call.traceId === called.id,
			);
			assert.equal(handler?.peerId, "acceptor");
			assert.equal(handler?.direction, RpcCallDirectionEnum.incoming);
			assert.equal(
				handler?.arguments,
				first.recorder
					.snapshot()
					.calls.find((call) => call.traceId === called.id)?.arguments,
			);
			assert.ok(
				first.recorder
					.snapshot()
					.entries.some((entry) =>
						entry.transportMessage?.payload?.includes(called.id ?? "missing"),
					),
			);
			const duplicate = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.save,
				definition,
			});
			const conflict = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.expose,
				id: duplicate.id,
				revision: 1,
			});
			assert.equal(conflict.error, LabCustomFailureEnum.conflict);
			assert.equal(
				conflict.snapshot.definitions.find((entry) => entry.id === saved.id)
					?.exposed,
				true,
			);
			for (const action of [
				LabCustomActionEnum.save,
				LabCustomActionEnum.remove,
			]) {
				const rejected = await command(server.origin, first.instanceId, {
					action,
					id: saved.id,
					revision: 2,
					definition,
				});
				assert.equal(rejected.error, LabCustomFailureEnum.exposed);
			}
			const builtIn = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.save,
				definition: { ...definition, wireName: LAB_SERVICE_NAMES.lab },
			});
			assert.equal(
				(
					await command(server.origin, first.instanceId, {
						action: LabCustomActionEnum.expose,
						id: builtIn.id,
						revision: 1,
					})
				).error,
				LabCustomFailureEnum.conflict,
			);
			assert.equal(await first.lab.identify(), first.peerId);
			const scoped = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.save,
				definition: {
					...definition,
					wireName: "scoped",
					target: first.nodeTarget,
				},
			});
			assert.equal(
				(
					await command(server.origin, first.instanceId, {
						action: LabCustomActionEnum.expose,
						id: scoped.id,
						revision: 1,
					})
				).ok,
				true,
			);
			const foreign = local(second.runtime, {
				action: LabCustomActionEnum.resolve,
				facade: {
					...definition,
					wireName: "scoped",
					target: second.nodeTarget,
				},
			});
			assert.equal(
				(
					await settled(
						second.runtime,
						local(second.runtime, {
							action: LabCustomActionEnum.call,
							facadeId: foreign.id,
							method: "echo",
							argsJson: "[]",
						}).id,
					)
				).outcome,
				"unknown-service",
			);
			await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.revoke,
				id: saved.id,
				revision: 2,
			});
			assert.equal(
				(
					await settled(
						second.runtime,
						local(second.runtime, {
							action: LabCustomActionEnum.call,
							facadeId: resolvedSecond.id,
							method: "echo",
							argsJson: "[]",
						}).id,
					)
				).outcome,
				"unknown-service",
			);
			const changed = {
				...definition,
				methods: [{ ...definition.methods[0], name: "replacement" }],
			};
			await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.save,
				id: saved.id,
				revision: 3,
				definition: changed,
			});
			await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.expose,
				id: saved.id,
				revision: 4,
			});
			assert.deepEqual(
				first.runtime
					.snapshot()
					.facades[0].methods.map((method) => method.name),
				["echo"],
			);
			assert.equal(
				(
					await settled(
						first.runtime,
						local(first.runtime, {
							action: LabCustomActionEnum.call,
							facadeId: resolved.id,
							method: "echo",
							argsJson: "[]",
						}).id,
					)
				).outcome,
				"unknown-method",
			);
			await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.reset,
				target: first.nodeTarget,
				revision: (await snapshot(server.origin)).revision,
			});
			assert.ok(
				(await snapshot(server.origin)).definitions.some(
					(entry) => entry.id === saved.id && entry.exposed,
				),
			);
			assert.equal(await first.lab.identify(), first.peerId);
		} finally {
			await Promise.all([
				first.client.shutdown(),
				second.client.shutdown(),
				server.shutdown(),
			]);
		}
	});

	it("EXAMPLE-LAB-CUSTOM-003 keeps independent cancellation and each side's real value-domain outcome", async () => {
		const server = await createExampleServer({ port: 0 });
		const page = await browser(server.origin);
		try {
			const definition = {
				...input(page.instanceId),
				methods: [
					{
						name: "slow",
						behavior: LabCustomBehaviorEnum.fixed,
						valueJson: '{"done":true}',
						delayMs: 1_000,
						cancelable: true,
					},
					{
						name: "fail",
						behavior: LabCustomBehaviorEnum.throw,
						valueJson: "null",
						delayMs: 0,
						cancelable: false,
					},
					{
						name: "invalid",
						behavior: LabCustomBehaviorEnum.fixed,
						valueJson: "1e400",
						delayMs: 0,
						cancelable: false,
					},
					{
						name: "__proto__",
						behavior: LabCustomBehaviorEnum.echo,
						valueJson: "null",
						delayMs: 0,
						cancelable: false,
					},
				],
			};
			const saved = await command(server.origin, page.instanceId, {
				action: LabCustomActionEnum.save,
				definition,
			});
			await command(server.origin, page.instanceId, {
				action: LabCustomActionEnum.expose,
				id: saved.id,
				revision: 1,
			});
			const facade = local(page.runtime, {
				action: LabCustomActionEnum.resolve,
				facade: { ...definition, target: page.nodeTarget },
			});
			const canceled = local(page.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: facade.id,
				method: "slow",
				argsJson: "[]",
			});
			const successful = local(page.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: facade.id,
				method: "slow",
				argsJson: "[]",
			});
			await eventually(
				async () =>
					(await labSnapshot(server.origin)).recording.calls.filter((call) =>
						[canceled.id, successful.id].includes(call.traceId),
					).length === 2,
			);
			page.recorder.clear();
			assert.equal(page.runtime.snapshot().calls.length, 2);
			await fetch(`${server.origin}/api/lab/records`, { method: "DELETE" });
			assert.equal(
				(await snapshot(server.origin)).definitions[0].exposed,
				true,
			);
			assert.equal(
				(await labSnapshot(server.origin)).recording.calls.length,
				2,
			);
			assert.equal(
				local(page.runtime, {
					action: LabCustomActionEnum.cancel,
					callId: canceled.id,
				}).ok,
				true,
			);
			await command(server.origin, page.instanceId, {
				action: LabCustomActionEnum.revoke,
				id: saved.id,
				revision: 2,
			});
			assert.equal(
				(await settled(page.runtime, canceled.id)).outcome,
				"canceled",
			);
			assert.equal(
				(await settled(page.runtime, successful.id)).result,
				'{"done": true}',
			);
			await command(server.origin, page.instanceId, {
				action: LabCustomActionEnum.expose,
				id: saved.id,
				revision: 3,
			});
			const before = page.runtime.snapshot().calls.length;
			for (const argsJson of ["{", "{}", "null"]) {
				assert.equal(
					local(page.runtime, {
						action: LabCustomActionEnum.call,
						facadeId: facade.id,
						method: "__proto__",
						argsJson,
					}).error,
					LabCustomFailureEnum.validation,
				);
				assert.equal(page.runtime.snapshot().calls.length, before);
			}
			const illegal = local(page.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: facade.id,
				method: "__proto__",
				argsJson: "[-0]",
			});
			assert.equal(
				(await settled(page.runtime, illegal.id)).outcome,
				"TypeError",
			);
			assert.equal(
				(await labSnapshot(server.origin)).recording.calls.some(
					(call) => call.traceId === illegal.id,
				),
				false,
			);
			assert.equal(
				page.recorder
					.snapshot()
					.entries.some((entry) =>
						entry.transportMessage?.payload?.includes(illegal.id ?? "missing"),
					),
				false,
			);
			const legal = local(page.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: facade.id,
				method: "__proto__",
				argsJson: '["safe"]',
			});
			assert.equal((await settled(page.runtime, legal.id)).result, '["safe"]');
			for (const method of ["fail", "invalid"]) {
				const failure = local(page.runtime, {
					action: LabCustomActionEnum.call,
					facadeId: facade.id,
					method,
					argsJson: "[]",
				});
				assert.equal(
					(await settled(page.runtime, failure.id)).outcome,
					"handler-failed",
				);
				const handler = (await labSnapshot(server.origin)).recording.calls.find(
					(call) => call.traceId === failure.id,
				);
				assert.equal(
					handler?.outcome,
					method === "invalid" ? "fulfilled" : "handler-failed",
				);
			}
			page.recorder.clear();
			assert.equal(page.runtime.snapshot().calls.length, 0);
		} finally {
			await Promise.all([page.client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-CUSTOM-003/004 calls a selected other page and retains closed targets without moving old facades", async () => {
		const server = await createExampleServer({ port: 0 });
		const first = await browser(server.origin);
		const second = await browser(server.origin);
		try {
			const definition = {
				...input(first.instanceId),
				target: first.browserTarget,
			};
			const saved = local(first.runtime, {
				action: LabCustomActionEnum.save,
				definition,
			});
			local(first.runtime, {
				action: LabCustomActionEnum.expose,
				id: saved.id,
				revision: 1,
			});
			const secondDefinition = {
				...definition,
				target: second.browserTarget,
				methods: [
					{
						...definition.methods[0],
						behavior: LabCustomBehaviorEnum.fixed,
						valueJson: '"other page"',
					},
				],
			};
			const secondSaved = local(second.runtime, {
				action: LabCustomActionEnum.save,
				definition: secondDefinition,
			});
			local(second.runtime, {
				action: LabCustomActionEnum.expose,
				id: secondSaved.id,
				revision: 1,
			});
			const catalog = {
				target: second.browserTarget,
				definitions: second.runtime.snapshot().definitions,
			};
			const advertised = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.advertise,
				catalog,
			});
			assert.equal(advertised.ok, true);
			assert.equal(
				advertised.snapshot.catalogs[0].target.peerId,
				second.peerId,
			);
			assert.equal(
				"valueJson" in
					advertised.snapshot.catalogs[0].definitions[0].methods[0],
				false,
			);
			const firstFacade = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.resolve,
				facade: definition,
			});
			const secondFacade = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.resolve,
				facade: secondDefinition,
			});
			const echo = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.call,
				facadeId: firstFacade.id,
				method: "echo",
				argsJson: '["first page"]',
			});
			const other = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.call,
				facadeId: secondFacade.id,
				method: "echo",
				argsJson: "[]",
			});
			await eventually(
				async () =>
					(await snapshot(server.origin)).calls.filter(
						(call) =>
							[echo.id, other.id].includes(call.id) &&
							call.outcome === "fulfilled",
					).length === 2,
			);
			const results = await snapshot(server.origin);
			assert.equal(
				results.calls.find((call) => call.id === other.id)?.result,
				'"other page"',
			);
			assert.equal(
				first.recorder
					.snapshot()
					.calls.some((call) => call.traceId === other.id),
				false,
			);
			assert.equal(
				second.recorder
					.snapshot()
					.calls.find((call) => call.traceId === other.id)?.peerId,
				second.peerId,
			);
			const clear = (await (
				await fetch(`${server.origin}/api/lab/records`, { method: "DELETE" })
			).json()) as LabClearResult;
			assert.ok(
				clear.lab.custom && clear.lab.custom.observation > results.observation,
			);
			assert.equal(clear.lab.custom.revision, results.revision);
			assert.equal(clear.lab.custom.calls.length, 0);
			assert.equal(clear.lab.custom.facades.length, results.facades.length);
			await second.client.shutdown();
			await eventually(
				async () =>
					!(await labSnapshot(server.origin)).peers.some(
						(peer) => peer.id === second.peerId,
					),
			);
			assert.equal(second.runtime.snapshot().definitions[0].targetValid, false);
			assert.equal(second.runtime.snapshot().definitions[0].exposed, false);
			const closed = await command(server.origin, first.instanceId, {
				action: LabCustomActionEnum.call,
				facadeId: secondFacade.id,
				method: "echo",
				argsJson: "[]",
			});
			await eventually(
				async () =>
					(await snapshot(server.origin)).calls.find(
						(call) => call.id === closed.id,
					)?.outcome === "unavailable",
			);
			const retained = await snapshot(server.origin);
			assert.equal(
				retained.facades.find((facade) => facade.id === secondFacade.id)?.target
					.peerId,
				second.peerId,
			);
			assert.equal(
				retained.facades.find((facade) => facade.id === secondFacade.id)
					?.targetValid,
				false,
			);
			assert.equal(retained.catalogs.length, 0);
			assert.equal(first.runtime.snapshot().definitions[0].exposed, true);
		} finally {
			await Promise.all([
				first.client.shutdown(),
				second.client.shutdown(),
				server.shutdown(),
			]);
		}
	});

	it("EXAMPLE-LAB-CUSTOM-004 queries a lost-response receipt without replaying and rejects old server identities", async () => {
		const server = await createExampleServer({ port: 0 });
		try {
			const initial = await snapshot(server.origin);
			const requestId = crypto.randomUUID();
			const body = {
				action: LabCustomActionEnum.save,
				definition: input(initial.instanceId),
				instanceId: initial.instanceId,
				requestId,
			};
			// Deterministic observation-boundary injection: discard the real mutation response.
			await fetch(`${server.origin}/api/custom`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const receipt: LabCustomCommandResult = await (
				await fetch(`${server.origin}/api/custom/operations/${requestId}`)
			).json();
			assert.equal(receipt.ok, true);
			assert.equal(receipt.snapshot.definitions.length, 1);
			const repeated: LabCustomCommandResult = await (
				await fetch(`${server.origin}/api/custom`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				})
			).json();
			assert.equal(repeated.id, receipt.id);
			assert.equal(repeated.snapshot.definitions.length, 1);
			assert.equal(
				(await fetch(`${server.origin}/api/custom/operations/missing`)).status,
				404,
			);
			assert.equal(
				(await fetch(`${server.origin}/api/custom/operations/%`)).status,
				400,
			);
			assert.equal(
				(
					await command(server.origin, "previous-server", {
						action: LabCustomActionEnum.reset,
						target: body.definition.target,
						revision: 1,
					})
				).error,
				LabCustomFailureEnum.staleInstance,
			);
			assert.equal((await snapshot(server.origin)).definitions.length, 1);
			const invalid = await fetch(`${server.origin}/api/custom`, {
				method: "POST",
				body: "{",
			});
			assert.equal(invalid.status, 400);
			assert.equal((await fetch(`${server.origin}/health`)).status, 200);
			const replacement = await createExampleServer({ port: 0 });
			try {
				assert.notEqual(
					(await snapshot(replacement.origin)).instanceId,
					initial.instanceId,
				);
				assert.equal(
					(await snapshot(replacement.origin)).definitions.length,
					0,
				);
				assert.equal(
					(await command(replacement.origin, initial.instanceId, body)).error,
					LabCustomFailureEnum.staleInstance,
				);
			} finally {
				await replacement.shutdown();
			}
		} finally {
			await server.shutdown();
		}
	});

	it("EXAMPLE-LAB-CUSTOM-004 preserves a custom exposure and in-flight invocation across genuine Recovery", {
		timeout: 10_000,
	}, async () => {
		const server = await createExampleServer({ port: 0 });
		const sockets: WebSocket[] = [];
		class ObservedWebSocketImpl extends WebSocket {
			constructor(url: string | URL, protocols?: string | string[]) {
				super(url, protocols);
				sockets.push(this);
			}
		}
		const page = await browser(server.origin, ObservedWebSocketImpl);
		try {
			const definition = {
				...input(page.instanceId),
				target: page.nodeTarget,
				methods: [{ ...input(page.instanceId).methods[0], delayMs: 750 }],
			};
			const saved = await command(server.origin, page.instanceId, {
				action: LabCustomActionEnum.save,
				definition,
			});
			await command(server.origin, page.instanceId, {
				action: LabCustomActionEnum.expose,
				id: saved.id,
				revision: 1,
			});
			const facade = local(page.runtime, {
				action: LabCustomActionEnum.resolve,
				facade: definition,
			});
			const invocation = local(page.runtime, {
				action: LabCustomActionEnum.call,
				facadeId: facade.id,
				method: "echo",
				argsJson: '["retained"]',
			});
			await eventually(async () =>
				(await labSnapshot(server.origin)).recording.calls.some(
					(call) => call.traceId === invocation.id,
				),
			);
			sockets[0].close();
			await eventually(
				() => sockets.length === 2 && sockets[1].readyState === WebSocket.OPEN,
			);
			assert.equal(await page.lab.identify(), page.peerId);
			assert.equal(
				(await settled(page.runtime, invocation.id)).result,
				'["retained"]',
			);
			assert.equal(
				(await labSnapshot(server.origin)).recording.calls.filter(
					(call) => call.traceId === invocation.id,
				).length,
				1,
			);
			assert.equal(
				(await snapshot(server.origin)).definitions[0].exposed,
				true,
			);
			assert.equal(page.runtime.snapshot().facades[0].id, facade.id);
			await page.client.shutdown();
			await eventually(
				async () =>
					(await snapshot(server.origin)).definitions[0].targetValid === false,
			);
			const closedDefinition = (await snapshot(server.origin)).definitions[0];
			assert.equal(closedDefinition.exposed, false);
			const newPage = await browser(server.origin);
			try {
				assert.notEqual(newPage.peerId, page.peerId);
				assert.equal(newPage.runtime.snapshot().definitions.length, 0);
				const rebound = await command(server.origin, page.instanceId, {
					action: LabCustomActionEnum.save,
					id: saved.id,
					revision: closedDefinition.revision,
					definition: { ...definition, target: newPage.nodeTarget },
				});
				assert.equal(rebound.ok, true);
				assert.equal(
					rebound.snapshot.definitions[0].target.peerId,
					newPage.peerId,
				);
				const old = local(page.runtime, {
					action: LabCustomActionEnum.call,
					facadeId: facade.id,
					method: "echo",
					argsJson: "[]",
				});
				assert.equal(
					(await settled(page.runtime, old.id)).outcome,
					"unavailable",
				);
				assert.equal(
					page.runtime.snapshot().facades[0].target.peerId,
					page.peerId,
				);
			} finally {
				await newPage.client.shutdown();
			}
		} finally {
			await Promise.all([page.client.shutdown(), server.shutdown()]);
		}
	});
});

async function snapshot(origin: string): Promise<LabCustomSnapshot> {
	return (await fetch(`${origin}/api/custom`)).json();
}

async function command(
	origin: string,
	instanceId: string,
	body: object,
): Promise<LabCustomCommandResult> {
	return (
		await fetch(`${origin}/api/custom`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				instanceId,
				requestId: crypto.randomUUID(),
				...body,
			}),
		})
	).json();
}

function input(instanceId: string): LabCustomDefinitionInput {
	return {
		target: { scope: LabCustomScopeEnum.nodeGlobal, instanceId },
		wireName: "custom.echo",
		methods: [
			{
				name: "echo",
				behavior: LabCustomBehaviorEnum.echo,
				valueJson: "null",
				delayMs: 0,
				cancelable: false,
			},
		],
	};
}

function local(
	runtime: ILabCustomServices,
	body: object,
): LabCustomCommandResult {
	return runtime.execute({
		instanceId: runtime.snapshot().instanceId,
		requestId: crypto.randomUUID(),
		...body,
	} as LabCustomCommand);
}

async function browser(origin: string, webSocket = WebSocket) {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const traceContext = createLabTraceContext();
	const client = createExampleClient({
		adapterFactory: () =>
			createObservedConnectorAdapter(
				createWebSocketConnectorAdapter({
					url: `${origin.replace("http:", "ws:")}/rpc`,
					webSocket,
				}),
				recorder,
			),
		display: { showMessage: () => "custom test" },
		traceContext,
	});
	await client.reconnection.connect();
	const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
	const peerId = await lab.identify();
	const instanceId = await lab.identifyServer();
	const nodeTarget = { scope: LabCustomScopeEnum.nodePeer, instanceId, peerId };
	const browserTarget = {
		...nodeTarget,
		scope: LabCustomScopeEnum.browserPeer,
	};
	const peer = client.connector.peer;
	const valid = (target: { instanceId: string; peerId?: string }) =>
		target.instanceId === instanceId &&
		target.peerId === peerId &&
		peer.state.status !== RpcStateStatusEnum.closed;
	const runtime = createLabCustomServices({
		instanceId: crypto.randomUUID(),
		side: LabSideEnum.browser,
		recorder,
		traceContext,
		targets: {
			exposure: (target) =>
				valid(target) && target.scope === LabCustomScopeEnum.browserPeer
					? peer
					: undefined,
			peer: (target) =>
				valid(target) && target.scope === LabCustomScopeEnum.nodePeer
					? peer
					: undefined,
		},
	});
	return {
		client,
		recorder,
		runtime,
		lab,
		peerId,
		instanceId,
		nodeTarget,
		browserTarget,
	};
}

async function settled(runtime: ILabCustomServices, id: string | undefined) {
	for (const deadline = Date.now() + 3_000; Date.now() < deadline; ) {
		const call = runtime.snapshot().calls.find((call) => call.id === id);
		if (call && call.outcome !== "pending") return call;
		await setTimeout(5);
	}
	throw new Error("Custom caller did not settle.");
}

async function labSnapshot(origin: string): Promise<LabServerSnapshot> {
	return (await fetch(`${origin}/api/lab`)).json();
}

async function eventually(
	check: () => boolean | Promise<boolean>,
): Promise<void> {
	for (const deadline = Date.now() + 3_000; Date.now() < deadline; ) {
		if (await check()) return;
		await setTimeout(5);
	}
	throw new Error("Custom service observation did not become true.");
}
