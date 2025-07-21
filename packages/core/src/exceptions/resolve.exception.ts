/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 09:32:03
 */

export class ResolveException extends Error {
	private __isResolveException = true;
	static isResolveException(error: unknown): error is ResolveException {
		// don't use instanceof, because it will be false when the error is not in the same frame
		return (
			(error as unknown as ResolveException)?.__isResolveException === true
		);
	}
}
