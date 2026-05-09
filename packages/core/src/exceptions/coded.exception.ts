/**
 * @overview Base exception for coded errors.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

export abstract class CodedException<TCode extends string> extends Error {
	readonly code: TCode;
	readonly detail: string;

	constructor(code: TCode, detail: string) {
		super(formatCodedErrorMessage(code, detail));
		this.code = code;
		this.detail = detail;
	}
}

export function formatCodedErrorMessage(code: string, detail: string): string {
	return `${code}: ${detail}`;
}
