/**
 * @overview Default Protocol bounded outbound lane fairness.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { describe, expect, it, vi } from "vitest";

import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import { createDefaultRpcTestNetwork } from "../default-protocol/test.utils";

interface IFairnessService {
	run(value: number): number;
}

const IConnectorFairnessService = createServiceIdentifier<IFairnessService>(
	"IConnectorFairnessService",
);
const IAcceptorFairnessService = createServiceIdentifier<IFairnessService>(
	"IAcceptorFairnessService",
);

function createDeferred(): {
	readonly promise: Promise<void>;
	resolve(): void;
} {
	let resolve!: () => void;
	const promise = new Promise<void>((taskResolve) => {
		resolve = taskResolve;
	});
	return { promise, resolve };
}

describe("Default RPC Protocol outbound fairness", () => {
	it("RPC-SCHEDULE-002 alternates retained control and Pending Invocation lanes starting with control RPC-CORPUS-004", async () => {
		const network = createDefaultRpcTestNetwork();
		const connectorDescriptor = createRemoteServiceDescriptor(
			IConnectorFairnessService,
			{
				wireName: "example.connector-fairness.v1",
				methods: { run: true },
			},
		);
		const acceptorDescriptor = createRemoteServiceDescriptor(
			IAcceptorFairnessService,
			{
				wireName: "example.acceptor-fairness.v1",
				methods: { run: true },
			},
		);
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const blocked = createDeferred();
		let connectorDispatches = 0;
		let blockedFirstResult = false;
		connector.peer.expose(connectorDescriptor, {
			run: (value) => {
				connectorDispatches += 1;
				return value;
			},
		});
		acceptor.expose(acceptorDescriptor, { run: (value) => value });
		network.setInterceptor((record) => {
			const semantic = Reflect.get(record.value, "message") as
				| Readonly<Record<string, unknown>>
				| undefined;
			if (
				!blockedFirstResult &&
				record.direction === "connector" &&
				record.value.kind === "message" &&
				semantic?.kind === "result"
			) {
				blockedFirstResult = true;
				return { settlement: blocked.promise };
			}
			return undefined;
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter());
		const connectorService = acceptor.peers[0]?.resolve(connectorDescriptor);
		if (connectorService === undefined) {
			throw new Error("Expected the accepted Default RPC Peer.");
		}
		const first = connectorService.run(1);
		await expect(first).resolves.toBe(1);
		const second = connectorService.run(2);
		const third = connectorService.run(3);
		const outgoing = connector.peer.resolve(acceptorDescriptor).run(4);
		await vi.waitFor(() => expect(connectorDispatches).toBe(3));
		const firstResultIndex = network.records.findIndex((record) => {
			const semantic = Reflect.get(record.value, "message") as
				| Readonly<Record<string, unknown>>
				| undefined;
			return record.direction === "connector" && semantic?.kind === "result";
		});

		blocked.resolve();
		await Promise.all([second, third, outgoing]);

		const nextConnectorMessage = network.records
			.slice(firstResultIndex + 1)
			.find(
				(record) =>
					record.direction === "connector" && record.value.kind === "message",
			);
		expect(
			Reflect.get(nextConnectorMessage?.value ?? {}, "message"),
		).toMatchObject({ kind: "call" });

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SCHEDULE-003 bounded-alternates a coalesced Pong with continuous sequenced work RPC-CORPUS-004", async () => {
		const network = createDefaultRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(IAcceptorFairnessService, {
			wireName: "example.probe-fairness.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const blocked = createDeferred();
		let blockedFirstCall = false;
		acceptor.expose(descriptor, { run: (value) => value });
		network.setInterceptor((record) => {
			const semantic = Reflect.get(record.value, "message") as
				| Readonly<Record<string, unknown>>
				| undefined;
			if (
				!blockedFirstCall &&
				record.direction === "connector" &&
				record.value.kind === "message" &&
				semantic?.kind === "call"
			) {
				blockedFirstCall = true;
				return { settlement: blocked.promise };
			}
			return undefined;
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter());
		const service = connector.peer.resolve(descriptor);
		const first = service.run(1);
		await expect(first).resolves.toBe(1);
		const second = service.run(2);
		const third = service.run(3);
		network.emit(
			1,
			"connector",
			new TextEncoder().encode(JSON.stringify({ kind: "ping" })),
		);
		await Promise.resolve();
		await Promise.resolve();
		const firstCallIndex = network.records.findIndex((record) => {
			const semantic = Reflect.get(record.value, "message") as
				| Readonly<Record<string, unknown>>
				| undefined;
			return record.direction === "connector" && semantic?.kind === "call";
		});

		blocked.resolve();
		await Promise.all([second, third]);

		const nextTwoKinds = network.records
			.slice(firstCallIndex + 1)
			.filter((record) => record.direction === "connector")
			.map((record) => {
				const semantic = Reflect.get(record.value, "message") as
					| Readonly<Record<string, unknown>>
					| undefined;
				return semantic?.kind ?? record.value.kind;
			})
			.filter((kind) => kind === "call" || kind === "pong")
			.slice(0, 2);
		expect(nextTwoKinds).toContain("call");
		expect(nextTwoKinds).toContain("pong");

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SCHEDULE-003 RPC-SCHEDULE-004 advances one coalesced ACK through continuous Ping input", async () => {
		const network = createDefaultRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(
			IConnectorFairnessService,
			{
				wireName: "example.ack-fairness.v1",
				methods: { run: true },
			},
		);
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({ runtimePolicy: { ackDelayMs: 1 } });
		const blocked = createDeferred();
		let blockedFirstPong = false;
		connector.peer.expose(descriptor, { run: (value) => value });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter());
		const service = acceptor.peers[0]?.resolve(descriptor);
		if (service === undefined) {
			throw new Error("Expected the accepted Default RPC Peer.");
		}
		await expect(service.run(1)).resolves.toBe(1);
		network.setInterceptor((record) => {
			if (record.direction !== "connector") {
				return undefined;
			}
			if (record.value.kind === "ack") {
				return { drop: true };
			}
			if (!blockedFirstPong && record.value.kind === "pong") {
				blockedFirstPong = true;
				return { drop: true, settlement: blocked.promise };
			}
			return undefined;
		});
		const activeStart = network.records.length;
		const encoder = new TextEncoder();
		network.emit(
			1,
			"connector",
			encoder.encode(
				JSON.stringify({
					kind: "message",
					seq: 2,
					message: { kind: "cancel", callId: "1" },
				}),
			),
		);
		for (let ordinal = 0; ordinal < 16; ordinal += 1) {
			network.emit(
				1,
				"connector",
				encoder.encode(JSON.stringify({ kind: "ping" })),
			);
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 5));

		blocked.resolve();
		await vi.waitFor(() => {
			expect(
				network.records
					.slice(activeStart)
					.some(
						(record) =>
							record.direction === "connector" &&
							record.value.kind === "ack" &&
							record.value.ackThrough === 2,
					),
			).toBe(true);
		});

		await Promise.all([connector.close(), acceptor.close()]);
	});
});
