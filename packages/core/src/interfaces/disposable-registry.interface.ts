/**
 * Disposable registry interface for managing owned resources.
 *
 * @overview
 * Defines the contract for objects that collect disposable resources and
 * cleanup callbacks, then dispose them together when the owner is disposed.
 *
 * @author AEPKILL
 * @created 2026-06-23 09:00:00
 */

import { createServiceIdentifier } from "@/utils/service-identifier.util";
import type { Cleanup, IDisposable } from "./disposable.interface";

/**
 * Interface for objects that manage owned disposable resources.
 *
 * @remarks
 * A disposable registry combines the disposable lifecycle contract with
 * methods for tracking owned disposables and cleanup callbacks.
 */
export interface IDisposableRegistry extends IDisposable {
	/**
	 * Registers a disposable resource for later cleanup.
	 *
	 * @param disposable - The disposable resource to track
	 */
	addDisposable(disposable: IDisposable): void;

	/**
	 * Registers a cleanup callback for later execution.
	 *
	 * @param cleanup - The cleanup callback to track
	 */
	addCleanup(cleanup: Cleanup): void;
}

export const IDisposableRegistry = createServiceIdentifier<IDisposableRegistry>(
	"IDisposableRegistry",
);
