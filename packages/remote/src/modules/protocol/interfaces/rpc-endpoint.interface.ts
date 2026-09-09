/**
 * @overview Internal current Physical Connection Endpoint seam.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export interface IRpcEndpoint {
	readonly isSendIdle: boolean;
	readonly isIngressIdle: boolean;
	configureSendProgressTimeout(timeoutMs: number): void;
	observeIngressIdle(observer: () => void): void;
	sendNow(message: Uint8Array): Promise<void>;
	fenceAndClose(): void;
}
