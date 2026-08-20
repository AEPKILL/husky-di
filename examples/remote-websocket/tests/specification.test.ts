/**
 * @overview Remote WebSocket example specification coverage.
 * @author AEPKILL
 * @created 2026-08-21 00:26:50
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	type IRpcConnector,
	type IRpcConnectorAdapter,
	RpcStateStatusEnum,
} from "@husky-di/remote";

import { connectRpcPeerOnOnline } from "@/web/utils/rpc-online-reconnect.util";
import { getRpcPeerStatusPresentation } from "@/web/utils/rpc-peer-status-presentation.util";

describe("Remote WebSocket example specification", () => {
	it("EXAMPLE-WS-STATE-001 presents every peer state without hiding disconnection", () => {
		assert.deepEqual(getRpcPeerStatusPresentation(RpcStateStatusEnum.unbound), {
			label: "Not connected",
			variant: "muted",
		});
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.connecting),
			{ label: "Connecting", variant: "warning" },
		);
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.connected),
			{ label: "Live transport", variant: "default" },
		);
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.recovering),
			{ label: "Transport disconnected", variant: "danger" },
		);
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.draining),
			{
				label: "Disconnecting",
				variant: "warning",
			},
		);
		assert.deepEqual(getRpcPeerStatusPresentation(RpcStateStatusEnum.closed), {
			label: "Connection closed",
			variant: "danger",
		});
	});

	it("EXAMPLE-WS-RECOVERY-001 retries once on online with a fresh Adapter", async () => {
		const onlineEvents = new ControlledOnlineEvents();
		const adapters: IRpcConnectorAdapter[] = [];
		const attempts: Array<PromiseWithResolvers<void>> = [];
		let peerStatus = RpcStateStatusEnum.unbound;
		const connector = {
			peer: {
				get state() {
					return { status: peerStatus };
				},
			},
			connect(adapter: IRpcConnectorAdapter) {
				adapters.push(adapter);
				const attempt = Promise.withResolvers<void>();
				attempts.push(attempt);
				return attempt.promise;
			},
		} as unknown as IRpcConnector;
		const errors: unknown[] = [];
		const stop = connectRpcPeerOnOnline(
			connector,
			() => ({ id: adapters.length + 1 }) as unknown as IRpcConnectorAdapter,
			(error) => errors.push(error),
			onlineEvents,
		);

		assert.equal(attempts.length, 1);
		onlineEvents.emit();
		assert.equal(attempts.length, 1);
		peerStatus = RpcStateStatusEnum.recovering;
		attempts[0]?.reject(new Error("offline"));
		await Promise.resolve();
		await Promise.resolve();
		onlineEvents.emit();
		assert.equal(attempts.length, 2);
		assert.notEqual(adapters[0], adapters[1]);
		peerStatus = RpcStateStatusEnum.connected;
		attempts[1]?.resolve();
		await Promise.resolve();
		await Promise.resolve();
		onlineEvents.emit();
		assert.equal(attempts.length, 2);
		assert.deepEqual(
			errors.map((error) => (error instanceof Error ? error.message : error)),
			[undefined, "offline", undefined],
		);

		stop();
		peerStatus = RpcStateStatusEnum.recovering;
		onlineEvents.emit();
		assert.equal(attempts.length, 2);
		assert.equal(onlineEvents.listenerCount, 0);
	});
});

class ControlledOnlineEvents {
	private readonly _listeners = new Set<() => void>();

	get listenerCount(): number {
		return this._listeners.size;
	}

	addEventListener(_type: "online", listener: () => void): void {
		this._listeners.add(listener);
	}

	removeEventListener(_type: "online", listener: () => void): void {
		this._listeners.delete(listener);
	}

	emit(): void {
		for (const listener of [...this._listeners]) {
			listener();
		}
	}
}
