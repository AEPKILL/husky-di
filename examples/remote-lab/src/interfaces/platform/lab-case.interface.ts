/**
 * @overview Developer case SDK contracts for explicit steps and platform-owned Remote environments.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@husky-di/remote";
import type { LabNodeKindEnum } from "../../enums/platform/execution.enum";

export interface ILabCase {
	readonly title: string;
	readonly timeoutMs?: number;
	run(context: ILabCaseContext): void | Promise<void>;
}

export interface ILabCaseContext {
	readonly signal: AbortSignal;
	readonly parameters: Readonly<Record<string, unknown>>;
	readonly environment: ILabEnvironment;
	step<T>(name: string, operation: () => T | Promise<T>): Promise<T>;
	assert(
		condition: unknown,
		message: string,
		actual?: unknown,
		expected?: unknown,
	): void;
	own(cleanup: () => void | Promise<void>): () => void;
	log(message: string, data?: unknown): void;
}

export interface ILabEnvironment {
	node(
		entry: string,
		parameters?: Readonly<Record<string, unknown>>,
	): Promise<ILabNode>;
	browser(
		entry: string,
		parameters?: Readonly<Record<string, unknown>>,
	): Promise<ILabNode>;
}

export interface ILabNode {
	readonly id: string;
	readonly kind: LabNodeKindEnum;
	readonly result: unknown;
	call<T = unknown>(
		exportName: string,
		...args: readonly unknown[]
	): Promise<T>;
	close(): Promise<void>;
}

export interface ILabNodeContext {
	readonly signal: AbortSignal;
	readonly parameters: Readonly<Record<string, unknown>>;
	own(cleanup: () => void | Promise<void>): () => void;
	log(message: string, data?: unknown): void;
	observe(
		owner: {
			readonly state: unknown;
			readonly event$: {
				subscribe(next: (event: unknown) => void): { unsubscribe(): void };
			};
		},
		name?: string,
	): () => void;
	transport<T extends IRpcConnectorAdapter | IRpcAcceptorAdapter>(
		adapter: T,
	): T;
}
