/**
 * @overview Internal current Physical Connection Endpoint seam.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

export interface IRpcEndpoint {
	readonly isSendIdle: boolean;
	readonly isIngressIdle: boolean;
	configureSendProgressTimeout(timeoutMs: number): void;
	observeIngressIdle(observer: () => void): void;
	sendNow(message: Uint8Array): Promise<void>;
	fenceAndClose(): void;
}
