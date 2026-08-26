/**
 * @overview Internal lifecycle factories for built-in Protocol role runtimes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcBindingAttempt } from "@/interfaces/protocol/rpc-binding-attempt.interface";
import type { IRpcSession } from "@/interfaces/protocol/rpc-session.interface";
import type { CreateRpcBindingAttemptOptions } from "@/types/protocol/rpc-binding-attempt.type";
import type { CreateRpcSessionOptions } from "@/types/protocol/rpc-session.type";

export type RpcBindingAttemptFactory<TKey> = (
	options: CreateRpcBindingAttemptOptions,
) => IRpcBindingAttempt<TKey>;

export type RpcSessionFactory<TKey> = (
	options: CreateRpcSessionOptions<TKey>,
) => IRpcSession<TKey>;
