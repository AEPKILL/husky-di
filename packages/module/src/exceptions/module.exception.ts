/**
 * @overview Module package exception.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import { CodedException } from "@husky-di/core";
import type { ModuleErrorCode } from "@/types/module-error-code.type";

export class ModuleException extends CodedException<ModuleErrorCode> {
	/** Internal marker to identify ModuleException instances across frames. */
	private __isModuleException__ = true;

	static isModuleException(error: unknown): error is ModuleException {
		return (
			(error as unknown as ModuleException)?.__isModuleException__ === true
		);
	}
}
