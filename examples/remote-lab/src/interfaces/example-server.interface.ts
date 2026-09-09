/**
 * @overview Running Node example server lifetime.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

export interface IExampleServer {
	readonly origin: string;
	shutdown(): Promise<void>;
}
