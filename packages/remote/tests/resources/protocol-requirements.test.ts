/**
 * @overview Verifies protocol requirements.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import { normalizeRpcApplicationArguments } from "../../src/modules/protocol";
import {
	createRpcDirectSessionHarness,
	createRpcTestNetwork,
} from "../protocol/test.utils";
import { IRequirementsService } from "./requirements/test.utils";

describe("Default RPC Protocol remaining requirements", () => {
	it("RPC-LEDGER-001 RPC-RESOURCE-005 charges Pending payload weight plus 256 bytes before assigning wire identity", async () => {
		const network = createRpcTestNetwork();
		const blocked = Promise.withResolvers<void>();
		const descriptor = createRemoteServiceDescriptor(IRequirementsService, {
			wireName: "example.requirements.v1",
			methods: { run: true },
		});
		const policy = { maxRetainedBytesPerSession: 4 * 1024 * 1024 };
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		let blockedFirstCall = false;
		acceptor.expose(descriptor, { run: (value) => value.length });
		network.setInterceptor((record) => {
			const message = Reflect.get(record.value, "message") as
				| Readonly<Record<string, unknown>>
				| undefined;
			if (
				!blockedFirstCall &&
				record.direction === "connector" &&
				message?.kind === "call"
			) {
				blockedFirstCall = true;
				return { settlement: blocked.promise };
			}
			return undefined;
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const service = connector.peer.resolve(descriptor);
		await expect(service.run("first")).resolves.toBe(5);
		const maximumString = "x".repeat(512 * 1024);
		const admittedPending = service.run(maximumString);

		await expect(service.run(maximumString)).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(
			network.records.filter((record) => {
				const message = Reflect.get(record.value, "message") as
					| Readonly<Record<string, unknown>>
					| undefined;
				return record.direction === "connector" && message?.kind === "call";
			}),
		).toHaveLength(1);

		blocked.resolve();
		await expect(admittedPending).resolves.toBe(maximumString.length);
		expect(
			network.records
				.filter((record) => {
					const message = Reflect.get(record.value, "message") as
						| Readonly<Record<string, unknown>>
						| undefined;
					return record.direction === "connector" && message?.kind === "call";
				})
				.map((record) => ({
					seq: record.value.seq,
					callId: Reflect.get(record.value.message as object, "callId"),
				})),
		).toEqual([
			{ seq: 1, callId: "1" },
			{ seq: 2, callId: "2" },
		]);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-LEDGER-001 allocates independent continuous Call Ordinals in both Session directions", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(IRequirementsService, {
			wireName: "example.bidirectional-ledger.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		acceptor.expose(descriptor, { run: (value) => value.length });
		connector.peer.expose(descriptor, { run: (value) => value.length });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptedPeer = acceptor.peers[0];
		if (acceptedPeer === undefined) {
			throw new Error("Expected one accepted Default RPC Peer.");
		}
		await expect(connector.peer.resolve(descriptor).run("a")).resolves.toBe(1);
		await expect(connector.peer.resolve(descriptor).run("bb")).resolves.toBe(2);
		await expect(acceptedPeer.resolve(descriptor).run("ccc")).resolves.toBe(3);
		await expect(acceptedPeer.resolve(descriptor).run("dddd")).resolves.toBe(4);

		const callIdsByDirection = (direction: "connector" | "acceptor") =>
			network.records
				.filter((record) => {
					const message = Reflect.get(record.value, "message") as
						| Readonly<Record<string, unknown>>
						| undefined;
					return record.direction === direction && message?.kind === "call";
				})
				.map((record) => Reflect.get(record.value.message as object, "callId"));
		expect(callIdsByDirection("connector")).toEqual(["1", "2"]);
		expect(callIdsByDirection("acceptor")).toEqual(["1", "2"]);

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SEC-001 RPC-SEC-004 exposes the bearer resume token on plaintext fixtures and makes no secure-Recovery claim", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(IRequirementsService, {
			wireName: "example.plaintext-deployment.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const connectorAdapter = network.createConnectorAdapter();
		const plaintextRecords: string[] = [];
		let securityPropertyReads = 0;
		for (const adapter of [network.acceptorAdapter, connectorAdapter]) {
			Object.defineProperty(adapter, "isSecure", {
				configurable: true,
				get() {
					securityPropertyReads += 1;
					return true;
				},
			});
		}
		network.setInterceptor((_record, message) => {
			plaintextRecords.push(new TextDecoder().decode(message));
			return undefined;
		});
		acceptor.expose(descriptor, { run: (value) => value.length });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: connectorAdapter });
		await expect(
			connector.peer.resolve(descriptor).run("visible"),
		).resolves.toBe(7);

		expect(securityPropertyReads).toBe(0);
		expect(plaintextRecords.every((record) => JSON.parse(record))).toBe(true);
		expect(
			plaintextRecords.some((record) => record.includes('"resumeToken"')),
		).toBe(true);
		expect(connector).not.toHaveProperty("isSecure");
		expect(connector.peer).not.toHaveProperty("isSecure");
		expect(connector.peer.state).not.toHaveProperty("secureRecovery");

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SEC-002 generates one independent resume token per Session and carries each only in its fresh accept", async () => {
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor();
		const firstConnector = createRpcConnector();
		const secondConnector = createRpcConnector();

		await acceptor.listen(network.acceptorAdapter);
		await firstConnector.connect({ adapter: network.createConnectorAdapter() });
		await secondConnector.connect({
			adapter: network.createConnectorAdapter(),
		});

		const accepts = network.records.filter(
			(record) =>
				record.direction === "acceptor" && record.value.kind === "accept",
		);
		const tokens = accepts.map((record) => record.value.resumeToken);
		expect(accepts).toHaveLength(2);
		expect(new Set(tokens).size).toBe(2);
		for (const accept of accepts) {
			expect(accept.value).toMatchObject({
				profile: "husky-di-rpc/1",
				resumeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			});
		}
		expect(
			network.records.filter((record) => "resumeToken" in record.value),
		).toEqual(accepts);

		await Promise.all([
			firstConnector.close(),
			secondConnector.close(),
			acceptor.close(),
		]);
	});

	it("RPC-RESOURCE-006 rejects fresh pressure without evicting an existing connected Session", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(IRequirementsService, {
			wireName: "example.retained-owner.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor({ runtimePolicy: { maxSessions: 1 } });
		const retainedConnector = createRpcConnector();
		const overflowConnector = createRpcConnector();
		acceptor.expose(descriptor, { run: (value) => value.length });

		await acceptor.listen(network.acceptorAdapter);
		await retainedConnector.connect({
			adapter: network.createConnectorAdapter(),
		});
		const retainedPeer = acceptor.peers[0];
		await expect(
			overflowConnector.connect({ adapter: network.createConnectorAdapter() }),
		).rejects.toBeInstanceOf(Error);

		expect(acceptor.peers).toEqual([retainedPeer]);
		expect(retainedPeer?.state).toEqual({ status: "connected" });
		await expect(
			retainedConnector.peer.resolve(descriptor).run("retained"),
		).resolves.toBe(8);

		await Promise.all([
			retainedConnector.close(),
			overflowConnector.close(),
			acceptor.close(),
		]);
	});

	it("RPC-RECOVERY-003 RPC-RESOURCE-006 closes reclaimed Session admission before settling retained calls", () => {
		const { session } = createRpcDirectSessionHarness();
		const request = {
			service: "example.reentrant-reclamation.v1",
			method: "run",
			args: normalizeRpcApplicationArguments([]),
		};
		const outcomes: unknown[] = [];
		const observation: {
			reentrantReservation?: ReturnType<typeof session.prepareInvocation>;
		} = {};
		const admittedInvocation = session.prepareInvocation(request, (outcome) => {
			outcomes.push(outcome);
			observation.reentrantReservation = session.prepareInvocation(
				request,
				() => undefined,
			);
		});
		if (admittedInvocation === undefined) {
			throw new Error("Expected one admitted invocation reservation.");
		}
		admittedInvocation.start();
		session._enterRecovery();
		const pendingInvocation = session.prepareInvocation(request, (outcome) =>
			outcomes.push(outcome),
		);
		if (pendingInvocation === undefined) {
			throw new Error("Expected one Pending invocation reservation.");
		}

		session.terminateForced();

		expect(observation.reentrantReservation).toBeUndefined();
		expect(outcomes).toEqual([
			{ type: "failed", code: "outcome-unknown" },
			{ type: "failed", code: "unavailable" },
		]);
		expect(session._closed).toBe(true);
	});
});
