/**
 * @overview Base exception for coded errors.
 * @author AEPKILL
 * @created 2026-05-09 11:26:00
 */

export abstract class CodedException<TCode extends string> extends Error {
	readonly code: TCode;
	readonly detail: string;

	/** Internal marker to identify CodedException instances across frames. */
	private __isCodedException__ = true;

	constructor(code: TCode, detail: string) {
		super(formatCodedErrorMessage(code, detail));
		this.code = code;
		this.detail = detail;
	}

	// biome-ignore lint/suspicious/noExplicitAny: Preserve the public guard's existing error-code type.
	static isCodedException(error: unknown): error is CodedException<any> {
		return (
			// biome-ignore lint/suspicious/noExplicitAny: The marker is shared by exceptions of every code type.
			(error as unknown as CodedException<any>)?.__isCodedException__ === true
		);
	}
}

export function formatCodedErrorMessage(code: string, detail: string): string {
	return `${code}: ${detail}`;
}
