/**
 * @overview Owner and built-in Session retained-byte reservation ledger implementation.
 * @author AEPKILL
 * @created 2026-08-21 00:00:00
 */

import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcRetainedBytesLedger } from "@/interfaces/protocol/rpc-retained-bytes-ledger.interface";
import {
	rpcNonNegativeSafeIntegerSchema,
	rpcPositiveSafeIntegerSchema,
} from "@/utils/rpc-schema.util";

/** Atomically reserves one Session or Owner aggregate retained-byte allowance. */
export class RpcRetainedBytesLedgerImpl implements IRpcRetainedBytesLedger {
	readonly _maximumBytes: number;
	_retainedBytes = 0;

	public constructor(maximumBytes: number) {
		if (!rpcPositiveSafeIntegerSchema.safeParse(maximumBytes).success) {
			throw new TypeError(
				"RPC retained-byte maximum must be a positive safe integer.",
			);
		}
		this._maximumBytes = maximumBytes;
	}

	reserve(bytes: number): IRpcRetainedBytesReservation | undefined {
		if (!rpcNonNegativeSafeIntegerSchema.safeParse(bytes).success) {
			throw new TypeError(
				"RPC retained-byte reservation must be a non-negative safe integer.",
			);
		}
		if (bytes > this._maximumBytes - this._retainedBytes) {
			return undefined;
		}
		this._retainedBytes += bytes;
		let released = false;
		return Object.freeze<IRpcRetainedBytesReservation>({
			release: () => {
				if (released) {
					return;
				}
				released = true;
				this._retainedBytes -= bytes;
			},
		});
	}
}
