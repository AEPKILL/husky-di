/**
 * @overview Compile-time caller and Framework boundary probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { test } from "vitest";

import type * as Remote from "../../src/index";
import type { IRpcAcceptor } from "../../src/index";

test("RPC-API-007 omits the aggregate Acceptor facade", () => {
	// @ts-expect-error RPC-API-007 removes the aggregate result type.
	type MissingRpcPeerResult = import("../../src/index").RpcPeerResult;
	void (null as unknown as MissingRpcPeerResult);

	const acceptor = null as unknown as IRpcAcceptor;
	// @ts-expect-error RPC-API-007 keeps multi-peer composition application-owned.
	void acceptor.resolveAll;
});

test("RPC-BASE-003 keeps the Codec interface private", () => {
	// @ts-expect-error RPC-BASE-003 keeps the Codec interface private.
	type MissingRpcCodec = import("../../src/protocol").IRpcCodec;
	void (null as unknown as MissingRpcCodec);
});

test("RPC-POLICY-004 keeps the internal scheduler private", () => {
	// @ts-expect-error RPC-POLICY-004 keeps the internal scheduler private.
	type MissingRpcScheduler = import("../../src/index").RpcHandlerSchedulerImpl;
	void (null as unknown as MissingRpcScheduler);

	type HandlerJob =
		import("../../src/interfaces/owner/rpc-handler-scheduler.interface").RpcHandlerJob;
	// @ts-expect-error Scheduler jobs receive no permit-release capability.
	const releaseCapableJob: HandlerJob = (_release: () => void) =>
		Promise.resolve();
	void releaseCapableJob;
	// @ts-expect-error Scheduler jobs report settlement with a native Promise.
	const nonPromiseJob: HandlerJob = () => true;
	void nonPromiseJob;
});

test("RPC-API-005 keeps Publisher roles private and role-specific", () => {
	// @ts-expect-error RPC-API-005 does not publish its internal publication seam.
	type MissingRpcConnectorPublisher = Remote.IRpcConnectorPublisher;
	void (null as unknown as MissingRpcConnectorPublisher);

	type ConnectorPublisher =
		import("../../src/interfaces/owner/rpc-owner-publisher.interface").IRpcConnectorPublisher;
	const connector = null as unknown as ConnectorPublisher;
	// @ts-expect-error Connector publication has no Acceptor processing role.
	void connector.processing;
	// @ts-expect-error The old broad processing name no longer exists.
	void connector.busy;
	// @ts-expect-error Connector publication has no membership snapshot.
	void connector.peers;
	// @ts-expect-error Connector publication has no membership stream.
	void connector.peers$;
	// @ts-expect-error The old broad membership name no longer exists.
	void connector.membership;
	// @ts-expect-error The old broad membership stream no longer exists.
	void connector.membership$;

	type ConnectorPublication =
		import("../../src/types/owner/rpc-owner-publication.type").RpcConnectorPublication;
	const invalidPublication: ConnectorPublication = {
		// @ts-expect-error Connector publications cannot publish membership.
		peers: [],
	};
	void invalidPublication;

	type ConnectorCommit =
		import("../../src/types/owner/rpc-owner-publication.type").RpcConnectorCommit;
	const invalidCommit: ConnectorCommit = {
		publication: {},
		// @ts-expect-error The old phase callback surface no longer exists.
		preCommit: () => {},
	};
	void invalidCommit;
	const invalidOwnershipCommit: ConnectorCommit = {
		publication: {},
		// @ts-expect-error Ownership changes belong inside apply.
		commitOwnership: () => {},
	};
	void invalidOwnershipCommit;
	const invalidPostCommit: ConnectorCommit = {
		publication: {},
		// @ts-expect-error New-snapshot effects belong inside apply.
		postCommit: () => {},
	};
	void invalidPostCommit;
	const invalidContinuation: ConnectorCommit = {
		publication: {},
		// @ts-expect-error Continuations are returned by apply.
		continue: () => {},
	};
	void invalidContinuation;
	type MissingCommitPlan =
		// @ts-expect-error The old commit-plan module no longer exists.
		import("../../src/types/owner/rpc-owner-commit-plan.type").RpcConnectorCommitPlan;
	void (null as unknown as MissingCommitPlan);

	type AcceptorPublisher =
		import("../../src/interfaces/owner/rpc-owner-publisher.interface").IRpcAcceptorPublisher;
	const acceptor = null as unknown as AcceptorPublisher;
	void acceptor.processing;
	void acceptor.peers;
	void acceptor.peers$;
});
