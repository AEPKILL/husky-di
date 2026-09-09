/**
 * @overview Shared resources/protocol-ledger fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { RpcCodecImpl } from "../../../src/modules/protocol";

export interface ILedgerService {
	run(value: number): number;
}

export interface ILargeLedgerService {
	run(): string;
}

export const codec = new RpcCodecImpl();

export const ILedgerService =
	createServiceIdentifier<ILedgerService>("ILedgerService");

export const ILargeLedgerService = createServiceIdentifier<ILargeLedgerService>(
	"ILargeLedgerService",
);
