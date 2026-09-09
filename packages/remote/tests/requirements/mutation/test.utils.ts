/**
 * @overview Shared requirements/acceptor-mutation-batch fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	type IRpcAcceptor,
	type RpcProtocolAcceptorFactory,
} from "../../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../../../src/protocol";

export { batchDescriptor };

export function createAcceptorHarness(
	options: {
		readonly shutdown?: () => Promise<void>;
		readonly close?: () => void;
	} = {},
): AcceptorHarness {
	let host: IRpcProtocolAcceptorHost | undefined;
	const protocolFactory: RpcProtocolAcceptorFactory = (nextHost) => {
		host = nextHost;
		return {
			async accept() {},
			shutdown: options.shutdown ?? (() => Promise.resolve()),
			close: options.close ?? (() => {}),
			async cleanup() {},
		};
	};
	const acceptor = createRpcAcceptor({ protocolFactory });
	if (host === undefined) {
		throw new Error("Expected an Acceptor Protocol host.");
	}
	return { acceptor, host };
}

export function admitEmptySession(
	host: IRpcProtocolAcceptorHost,
): IRpcProtocolSessionHost {
	const session: IRpcProtocolSession = {
		prepareInvocation: () => undefined,
		forceClose() {},
	};
	const sessionHost = host.admitSession(session);
	if (sessionHost === undefined) {
		throw new Error("Expected the Acceptor Session to be admitted.");
	}
	return sessionHost;
}

interface BatchService {
	wait(): Promise<string>;
}

interface AcceptorHarness {
	readonly acceptor: IRpcAcceptor;
	readonly host: IRpcProtocolAcceptorHost;
}

const IBatchService = createServiceIdentifier<BatchService>("IBatchService");

const batchDescriptor = createRemoteServiceDescriptor(IBatchService, {
	wireName: "example.acceptor-batch.v1",
	methods: { wait: true },
});
