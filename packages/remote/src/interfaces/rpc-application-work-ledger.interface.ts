/**
 * @overview Private Topology Owner Application Work and Active Stream ledger contract.
 * @author AEPKILL
 * @created 2026-08-24 23:48:00
 */

export interface IRpcApplicationWorkReservation {
	release(): void;
}

export interface IRpcApplicationWorkLedger {
	reserveLocal(stream: boolean): IRpcApplicationWorkReservation | undefined;
	reserveRemote(stream: boolean): IRpcApplicationWorkReservation | undefined;
}
