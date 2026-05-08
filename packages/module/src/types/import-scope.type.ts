/**
 * Import scope type definitions.
 *
 * @overview
 * Defines the normalized import visibility model used by module validation and
 * container assembly.
 *
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type { IModule } from "@/interfaces/module.interface";

export type ImportBinding = {
	readonly sourceModule: IModule;
	readonly sourceServiceIdentifier: ServiceIdentifier<unknown>;
	readonly localServiceIdentifier: ServiceIdentifier<unknown>;
};

export type ImportScope = {
	readonly bindings: ReadonlyArray<ImportBinding>;
	readonly visibleServiceIdentifiers: ReadonlySet<ServiceIdentifier<unknown>>;
};
