/**
 * @overview Private Physical Connection Binding contracts, programs, and decisions.
 * @author AEPKILL
 * @created 2026-08-28 23:19:00
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type {
	IRpcSession,
	RpcBindingCandidate,
	RpcContinuityCandidate,
	RpcInitiatorResume,
} from "@/interfaces/session/rpc-session.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export interface IRpcConnectorBindings {
	readonly session: IRpcSession | undefined;
	bind<TState>(
		connection: IRpcConnection,
		signal: AbortSignal,
		program: IRpcConnectorBindingProgram<TState>,
	): Promise<void>;
	shutdown(): Promise<void>;
	close(): void;
	cleanup(): Promise<void>;
}

export interface IRpcAcceptorBindings {
	session(sessionId: string): IRpcSession | undefined;
	accept(
		connection: IRpcConnection,
		signal: AbortSignal,
		program: IRpcAcceptorBindingProgram,
	): Promise<void>;
	shutdown(): Promise<void>;
	close(): void;
	cleanup(): Promise<void>;
}

export interface IRpcConnectorBindingProgram<TState> {
	begin(): RpcConnectorBindingStart<TState>;
	decide(
		context: IRpcConnectorBindingContext,
		state: TState,
		response: Uint8Array,
	): RpcConnectorBindingDecision;
}

export interface IRpcAcceptorBindingProgram {
	decide(
		context: IRpcAcceptorBindingContext,
		request: Uint8Array,
	): RpcAcceptorBindingDecision;
}

export interface IRpcConnectorBindingContext {
	prepareFresh<TValue>(
		options: RpcConnectorPrepareFreshOptions<TValue>,
	): RpcPreparedFresh<TValue> | undefined;
	install(
		installation: RpcConnectorBindingInstallation,
	): RpcConnectorBindingDecision;
	terminate(
		termination: RpcConnectorBindingTermination,
	): RpcConnectorBindingDecision;
	fail(
		error: unknown,
		reason?: RpcEndpointFailureEnum,
	): RpcConnectorBindingDecision;
}

export interface IRpcAcceptorBindingContext {
	prepareFresh<TValue>(
		options: RpcAcceptorPrepareFreshOptions<TValue>,
	): RpcPreparedFresh<TValue> | undefined;
	accept(acceptance: RpcAcceptorBindingAcceptance): RpcAcceptorBindingDecision;
	reject(reply: Uint8Array, error: Error): RpcAcceptorBindingDecision;
	terminate(
		termination: RpcAcceptorBindingTermination,
	): RpcAcceptorBindingDecision;
	fail(
		error: unknown,
		reason?: RpcEndpointFailureEnum,
	): RpcAcceptorBindingDecision;
}

export type RpcConnectorBindingStart<TState> = Readonly<{
	readonly message: Uint8Array;
	readonly state: TState;
}>;

export type RpcConnectorBindingDecision = Readonly<{
	readonly rpcConnectorBindingDecisionType: unique symbol;
}>;

export type RpcAcceptorBindingDecision = Readonly<{
	readonly rpcAcceptorBindingDecisionType: unique symbol;
}>;

export type RpcPreparedFresh<TValue> = Readonly<{
	readonly session: IRpcSession;
	readonly value: TValue;
	readonly rpcPreparedFreshType: unique symbol;
}>;

export type RpcBindingTarget = IRpcSession | RpcPreparedFresh<unknown>;

export type RpcPreparedSession<TValue> = Readonly<{
	readonly session: IRpcSession;
	readonly value: TValue;
}>;

export type RpcConnectorPrepareFreshOptions<TValue> = Readonly<{
	readonly createSession: (
		onTerminal: () => void,
	) => RpcPreparedSession<TValue>;
}>;

export type RpcAcceptorPrepareFreshOptions<TValue> = Readonly<{
	readonly createIdentity: () => string;
	readonly createSession: (
		identity: string,
		onTerminal: () => void,
	) => RpcPreparedSession<TValue>;
}>;

export type RpcBindingTerminalIntent =
	| Readonly<{
			readonly kind: "continuity-failure";
			readonly session: IRpcSession;
			readonly candidate: RpcContinuityCandidate | RpcInitiatorResume;
			readonly cause?: Error;
	  }>
	| Readonly<{
			readonly kind: "remote-terminated";
			readonly session: IRpcSession;
			readonly resume: RpcInitiatorResume;
			readonly cause?: Error;
	  }>;

export type RpcConnectorBindingTermination = RpcBindingTerminalIntent &
	Readonly<{
		readonly error: Error;
	}>;

export type RpcAcceptorBindingTermination = RpcBindingTerminalIntent &
	Readonly<{
		readonly reply: Uint8Array;
		readonly error: Error;
	}>;

export type RpcConnectorBindingInstallation = Readonly<{
	readonly target: RpcBindingTarget;
	readonly candidate: RpcBindingCandidate;
}>;

export type RpcAcceptorBindingAcceptance = RpcConnectorBindingInstallation &
	Readonly<{
		readonly reply: Uint8Array;
	}>;

export type RpcBindingFailure = Readonly<{
	readonly error: unknown;
	readonly reason?: RpcEndpointFailureEnum;
}>;
