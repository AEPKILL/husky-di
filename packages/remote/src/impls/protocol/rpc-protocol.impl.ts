/**
 * @overview Private built-in husky-di-rpc/1 Protocol roles and bootstrap programs.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_PROFILE } from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type {
	IRpcAcceptorBindingContext,
	IRpcAcceptorBindingProgram,
	IRpcAcceptorBindings,
	IRpcConnectorBindingContext,
	IRpcConnectorBindingProgram,
	IRpcConnectorBindings,
	RpcAcceptorBindingDecision,
	RpcConnectorBindingDecision,
} from "@/interfaces/endpoint/rpc-bindings.interface";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcSession,
	RpcInitiatorResume,
	RpcSessionFactory,
} from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcResumeAccept,
	RpcResumeReject,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";

/** Active one-to-one Default Protocol role and bootstrap program owner. */
export class RpcProtocolConnectorImpl implements IRpcProtocolConnector {
	readonly _host: IRpcProtocolConnectorHost;
	readonly _codec: IRpcCodec;
	readonly _bindings: IRpcConnectorBindings;
	readonly _createSession: RpcSessionFactory;

	public constructor(
		host: IRpcProtocolConnectorHost,
		codec: IRpcCodec,
		bindings: IRpcConnectorBindings,
		createSession: RpcSessionFactory,
	) {
		this._host = host;
		this._codec = codec;
		this._bindings = bindings;
		this._createSession = createSession;
	}

	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		const retainedSession = this._bindings.session;
		let task: Promise<void>;
		try {
			task =
				retainedSession === undefined
					? this._bindings.bind<undefined>(
							connection,
							signal,
							this._createFreshProgram(),
						)
					: this._bindings.bind<RpcInitiatorResume>(
							connection,
							signal,
							this._createResumeProgram(retainedSession),
						);
		} catch (error) {
			return Promise.reject(error);
		}
		// A Transport or Codec failure may embed token-bearing bootstrap bytes.
		// Keep the raw failure inside the built-in Protocol boundary.
		return task.catch(() => {
			throw new Error("Default RPC Connector binding attempt failed.");
		});
	}

	shutdown(): Promise<void> {
		return this._bindings.shutdown();
	}

	close(): void {
		this._bindings.close();
	}

	cleanup(): Promise<void> {
		return this._bindings.cleanup();
	}

	_createFreshProgram(): IRpcConnectorBindingProgram<undefined> {
		return Object.freeze({
			begin: () => {
				const request = Object.freeze({
					kind: RpcWireRecordKindEnum.fresh,
					profiles: Object.freeze([RPC_PROFILE]),
				}) as RpcFreshRequest;
				return Object.freeze({
					message: this._codec.encode(request),
					state: undefined,
				});
			},
			decide: (context, _state, bytes) =>
				this._decideFreshAccept(context, bytes),
		} satisfies IRpcConnectorBindingProgram<undefined>);
	}

	_createResumeProgram(
		session: IRpcSession,
	): IRpcConnectorBindingProgram<RpcInitiatorResume> {
		return Object.freeze({
			begin: () => {
				const resume = session.beginInitiatorResume();
				const request = Object.freeze({
					kind: RpcWireRecordKindEnum.resume,
					profile: RPC_PROFILE,
					sessionId: resume.sessionId,
					resumeToken: resume.resumeToken,
					receivedThrough: resume.receivedThrough,
					resumeAttempt: resume.resumeAttempt,
				}) as RpcResumeRequest;
				return Object.freeze({
					message: this._codec.encode(request),
					state: resume,
				});
			},
			decide: (context, resume, bytes) =>
				this._decideResumeOutcome(context, session, resume, bytes),
		} satisfies IRpcConnectorBindingProgram<RpcInitiatorResume>);
	}

	_decideFreshAccept(
		context: IRpcConnectorBindingContext,
		bytes: Uint8Array,
	): RpcConnectorBindingDecision {
		const accept = this._codec.decode(bytes, RpcDecodePhaseEnum.freshAccept);
		const prepared = context.prepareFresh({
			createSession: (onTerminal) => ({
				session: this._createSession({
					host: this._host,
					sessionId: accept.sessionId,
					resumeToken: accept.resumeToken,
					onTerminal,
				}),
				value: undefined,
			}),
		});
		if (prepared === undefined) {
			return context.fail(
				new Error(
					"Default RPC owner retained-byte allowance cannot protect a Session.",
				),
			);
		}
		const sessionHost = this._host.attachSession(prepared.session);
		if (sessionHost === undefined) {
			return context.fail(
				new Error("Framework rejected the Default RPC Connector Session."),
			);
		}
		return context.install({
			target: prepared,
			candidate: prepared.session.prepareFreshBinding(sessionHost),
		});
	}

	_decideResumeOutcome(
		context: IRpcConnectorBindingContext,
		session: IRpcSession,
		resume: RpcInitiatorResume,
		bytes: Uint8Array,
	): RpcConnectorBindingDecision {
		const outcome = this._codec.decode(bytes, RpcDecodePhaseEnum.resumeOutcome);
		if (outcome.kind === RpcWireRecordKindEnum.reject) {
			if (outcome.code === RpcResumeRejectCodeEnum.resumeRejected) {
				return context.fail(
					new Error("Default RPC resume was generically rejected."),
				);
			}
			const error = new Error(`Default RPC resume ended with ${outcome.code}.`);
			return outcome.code === RpcResumeRejectCodeEnum.continuityFailure
				? context.terminate({
						kind: "continuity-failure",
						session,
						candidate: resume,
						error,
					})
				: context.terminate({
						kind: "remote-terminated",
						session,
						resume,
						error,
					});
		}

		const preparation = session.prepareInitiatorBinding(resume, {
			profile: outcome.profile,
			sessionId: outcome.sessionId,
			bindingEpoch: outcome.bindingEpoch,
			peerReceivedThrough: outcome.receivedThrough,
		});
		if (preparation.kind === "stale") {
			return context.fail(preparation.error);
		}
		if (preparation.kind === "contradiction") {
			return context.terminate({
				kind: "continuity-failure",
				session,
				candidate: preparation,
				error: new Error(
					"Default RPC resume accept contradicts retained state.",
				),
			});
		}
		return context.install({ target: session, candidate: preparation });
	}
}

/** Passive one-to-many Default Protocol role and bootstrap program owner. */
export class RpcProtocolAcceptorImpl implements IRpcProtocolAcceptor {
	readonly _host: IRpcProtocolAcceptorHost;
	readonly _codec: IRpcCodec;
	readonly _createSecurityCarrier: () => string;
	readonly _bindings: IRpcAcceptorBindings;
	readonly _createSession: RpcSessionFactory;
	readonly _program: IRpcAcceptorBindingProgram;

	public constructor(
		host: IRpcProtocolAcceptorHost,
		codec: IRpcCodec,
		createSecurityCarrier: () => string,
		bindings: IRpcAcceptorBindings,
		createSession: RpcSessionFactory,
	) {
		this._host = host;
		this._codec = codec;
		this._createSecurityCarrier = createSecurityCarrier;
		this._bindings = bindings;
		this._createSession = createSession;
		this._program = Object.freeze({
			decide: (context, request) => this._decideBootstrap(context, request),
		} satisfies IRpcAcceptorBindingProgram);
	}

	accept(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		try {
			return this._bindings.accept(connection, signal, this._program);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	shutdown(): Promise<void> {
		return this._bindings.shutdown();
	}

	close(): void {
		this._bindings.close();
	}

	cleanup(): Promise<void> {
		return this._bindings.cleanup();
	}

	_decideBootstrap(
		context: IRpcAcceptorBindingContext,
		bytes: Uint8Array,
	): RpcAcceptorBindingDecision {
		const request = this._codec.decode(
			bytes,
			RpcDecodePhaseEnum.bootstrapRequest,
		);
		return request.kind === RpcWireRecordKindEnum.fresh
			? this._decideFreshRequest(context, request)
			: this._decideResumeRequest(context, request);
	}

	_decideFreshRequest(
		context: IRpcAcceptorBindingContext,
		request: RpcFreshRequest,
	): RpcAcceptorBindingDecision {
		if (!request.profiles.includes(RPC_PROFILE)) {
			return this._rejectFresh(context, "unsupported-profile");
		}
		const prepared = context.prepareFresh({
			createIdentity: this._createSecurityCarrier,
			createSession: (sessionId, onTerminal) => {
				const resumeToken = this._createSecurityCarrier();
				return {
					session: this._createSession({
						host: this._host,
						sessionId,
						resumeToken,
						onTerminal,
					}),
					value: resumeToken,
				};
			},
		});
		if (prepared === undefined) {
			return this._rejectFresh(context, "admission-rejected");
		}
		const accept = Object.freeze({
			kind: RpcWireRecordKindEnum.accept,
			profile: RPC_PROFILE,
			sessionId: prepared.session.sessionId,
			bindingEpoch: 1,
			resumeToken: prepared.value,
		}) as RpcFreshAccept;
		const sessionHost = this._host.admitSession(prepared.session);
		if (sessionHost === undefined) {
			return this._rejectFresh(context, "admission-rejected");
		}
		let candidate: ReturnType<IRpcSession["prepareFreshBinding"]>;
		try {
			candidate = prepared.session.prepareFreshBinding(sessionHost);
		} catch (error) {
			// Topology admission preceded candidate preparation, so unwind its Peer.
			sessionHost.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.forcedClose,
			});
			throw error;
		}
		return context.accept({
			target: prepared,
			candidate,
			reply: this._codec.encode(accept),
		});
	}

	_decideResumeRequest(
		context: IRpcAcceptorBindingContext,
		request: RpcResumeRequest,
	): RpcAcceptorBindingDecision {
		const session = this._bindings.session(request.sessionId);
		if (session === undefined || request.profile !== RPC_PROFILE) {
			return this._rejectResumeGeneric(context);
		}
		const review = session.reviewResponderResume({
			resumeToken: request.resumeToken,
			resumeAttempt: request.resumeAttempt,
			peerReceivedThrough: request.receivedThrough,
		});
		if (review.kind === "generic-reject") {
			return this._rejectResumeGeneric(context);
		}
		if (review.kind === "continuity-reject") {
			const reject = Object.freeze({
				kind: RpcWireRecordKindEnum.reject,
				code: RpcResumeRejectCodeEnum.continuityFailure,
			}) as RpcResumeReject;
			return context.terminate({
				kind: "continuity-failure",
				session,
				candidate: review,
				reply: this._codec.encode(reject),
				error: new Error("Default RPC resume cursor violated continuity."),
			});
		}
		const accept = Object.freeze({
			kind: RpcWireRecordKindEnum.accept,
			profile: RPC_PROFILE,
			sessionId: request.sessionId,
			bindingEpoch: review.bindingEpoch,
			receivedThrough: review.receivedThrough,
		}) as RpcResumeAccept;
		return context.accept({
			target: session,
			candidate: review,
			reply: this._codec.encode(accept),
		});
	}

	_rejectResumeGeneric(
		context: IRpcAcceptorBindingContext,
	): RpcAcceptorBindingDecision {
		const reject = Object.freeze({
			kind: RpcWireRecordKindEnum.reject,
			code: RpcResumeRejectCodeEnum.resumeRejected,
		}) as RpcResumeReject;
		return context.reject(
			this._codec.encode(reject),
			new Error("Default RPC resume was generically rejected."),
		);
	}

	_rejectFresh(
		context: IRpcAcceptorBindingContext,
		code: "unsupported-profile" | "admission-rejected",
	): RpcAcceptorBindingDecision {
		return context.reject(
			this._codec.encode({
				kind: RpcWireRecordKindEnum.reject,
				code,
			}),
			new Error(`Default RPC fresh ${code}.`),
		);
	}
}
