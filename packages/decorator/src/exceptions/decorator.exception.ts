/**
 * @overview Decorator package exception.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import { CodedException } from "@husky-di/core";
import type { DecoratorErrorCodeEnum } from "@/enums/decorator-error-code.enum";

export class DecoratorException extends CodedException<DecoratorErrorCodeEnum> {
	/** Internal marker to identify DecoratorException instances across frames. */
	private __isDecoratorException__ = true;

	static isDecoratorException(error: unknown): error is DecoratorException {
		return (
			(error as unknown as DecoratorException)?.__isDecoratorException__ ===
			true
		);
	}
}
