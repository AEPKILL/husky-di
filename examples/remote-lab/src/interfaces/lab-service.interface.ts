/**
 * @overview Shared Remote Lab business and control service contracts.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import type {
	LabFanoutResult,
	LabReport,
	ShippingQuote,
} from "@/types/lab-server.type";

export interface ILabService {
	quote(
		traceId: string,
		from: string,
		to: string,
		kg: number,
	): Promise<ShippingQuote>;
	echo(traceId: string, value: unknown): Promise<unknown>;
	fail(traceId: string): Promise<never>;
	report(
		traceId: string,
		pause: boolean,
		delayMs: number,
		signal: AbortSignal,
	): Promise<LabReport>;
	resume(traceId: string): boolean;
	identify(): string;
	setGlobalExposure(enabled: boolean): boolean;
	setPeerExposure(peerId: string, enabled: boolean): boolean;
	conflict(): string;
	callback(peerId: string, message: string): Promise<string>;
	fanout(message: string): Promise<LabFanoutResult[]>;
}

export interface IShippingService {
	quote(
		traceId: string,
		from: string,
		to: string,
		kg: number,
	): Promise<ShippingQuote>;
}

export interface IPeerLabService {
	inspect(): string;
}

export interface ILabBrowserService {
	receive(traceId: string, message: string): string | Promise<string>;
}

export const ILabService = createServiceIdentifier<ILabService>("LabService");
export const IShippingService =
	createServiceIdentifier<IShippingService>("ShippingService");
export const IPeerLabService =
	createServiceIdentifier<IPeerLabService>("PeerLabService");
export const ILabBrowserService =
	createServiceIdentifier<ILabBrowserService>("LabBrowserService");
