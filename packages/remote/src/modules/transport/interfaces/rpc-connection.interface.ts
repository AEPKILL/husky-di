/**
 * @overview Public Physical RPC Connection contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable } from "rxjs";

/** A finite-lived, ordered, full-duplex message channel. */
export interface IRpcConnection {
	readonly message$: Observable<Uint8Array>;
	/** Resolves after Local Admission, not remote delivery. */
	send(message: Uint8Array): Promise<void>;
	/** Synchronously prevents later sends and eventually releases the Connection. */
	close(): Promise<void>;
}
