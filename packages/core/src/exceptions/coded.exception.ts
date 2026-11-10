/**
 * @overview Base exception for coded errors.
 * @author AEPKILL
 * @created 2026-05-09 11:26:00
 */

export abstract class CodedException<TCode extends string> extends Error {
	readonly code: TCode;
	readonly detail: string;

	/** Internal marker to identify CoreException instances across frames. */
	private __isCodedException__ = true;

	constructor(code: TCode, detail: string) {
		super(formatCodedErrorMessage(code, detail));
		this.code = code;
		this.detail = detail;
	}

	static isCodedException(error: unknown): error is CodedException<any> {
		return (
			(error as unknown as CodedException<any>)?.__isCodedException__ === true
		);
	}
}

export function formatCodedErrorMessage(code: string, detail: string): string {
	return `${code}: ${detail}`;
}
