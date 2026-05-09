/**
 * @overview Core package exception.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import type { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { CodedException } from "@/exceptions/coded.exception";

export class CoreException extends CodedException<CoreErrorCodeEnum> {
	/** Internal marker to identify CoreException instances across frames. */
	private __isCoreException__ = true;

	static isCoreException(error: unknown): error is CoreException {
		return (error as unknown as CoreException)?.__isCoreException__ === true;
	}
}
