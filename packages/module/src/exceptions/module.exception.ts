/**
 * @overview Module package exception.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import type { ModuleErrorCode } from "@/types/module-error-code.type";

export class ModuleException extends Error {
	/** Internal marker to identify ModuleException instances across frames. */
	private __isModuleException__ = true;

	readonly code: ModuleErrorCode;

	constructor(code: ModuleErrorCode, message: string) {
		super(formatModuleErrorMessage(code, message));
		this.code = code;
	}

	static isModuleException(error: unknown): error is ModuleException {
		return (
			(error as unknown as ModuleException)?.__isModuleException__ === true
		);
	}
}

export function formatModuleErrorMessage(
	code: ModuleErrorCode,
	message: string,
): string {
	return `${code}: ${message}`;
}
