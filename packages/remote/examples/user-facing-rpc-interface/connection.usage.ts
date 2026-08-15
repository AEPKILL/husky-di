/**
 * @overview Protocol-side consumption of the proposed Physical Connection Interface.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { IRpcConnection } from "@husky-di/remote";
import { firstValueFrom, take } from "rxjs";

const PING_MESSAGE = Uint8Array.of(0x70, 0x69, 0x6e, 0x67);
const PONG_MESSAGE = Uint8Array.of(0x70, 0x6f, 0x6e, 0x67);

export async function runConnectionPingPong(
	connection: IRpcConnection,
): Promise<void> {
	const firstMessage = firstValueFrom(connection.message$.pipe(take(1)));
	await connection.send(PING_MESSAGE);
	assertPong(await firstMessage);
	await connection.close();
}

function assertPong(message: Uint8Array): void {
	if (
		message.length !== PONG_MESSAGE.length ||
		message.some((byte, index) => byte !== PONG_MESSAGE[index])
	) {
		throw new Error("RPC ping received a non-pong message");
	}
}
