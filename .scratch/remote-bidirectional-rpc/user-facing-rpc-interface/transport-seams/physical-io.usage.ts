/**
 * @overview 仅用于原型验证——三种候选 Physical Connection 的真实 I/O 用法。
 *
 * 三种方案都执行同一个 ping/pong 工作负载，以便直接比较 framing 与优雅结束成本，
 * 且刻意不评选胜出方案。
 *
 * @author AEPKILL
 * @created 2026-08-13 22:55:37
 */

import type {
	CompleteFrameAsyncIterable,
	IFrameCodec,
	OwnedReaderWriter,
	RawByteReadWrite,
} from "./rpc-interface";

const PING_FRAME = Uint8Array.of(0x70, 0x69, 0x6e, 0x67);
const PONG_FRAME = Uint8Array.of(0x70, 0x6f, 0x6e, 0x67);

/** 使用 A 的真实成员执行同一个逻辑 ping/pong 工作负载。 */
export async function runCompleteFramePingPong(
	connection: CompleteFrameAsyncIterable.IPhysicalConnection,
): Promise<void> {
	await connection.send(PING_FRAME);
	for await (const frame of connection.frames) {
		assertPong(frame);
		await connection.end();
		return;
	}
	throw new Error("Complete-frame connection ended before pong");
}

/** 使用 B 的真实成员和 RPC 消费方注入的 codec 执行同一工作负载。 */
export async function runRawBytePingPong(
	connection: RawByteReadWrite.IPhysicalConnection,
	codec: IFrameCodec,
): Promise<void> {
	const decoder = codec.createDecoder();
	await connection.write(codec.encode(PING_FRAME));

	for (;;) {
		const chunk = await connection.read();
		if (chunk === undefined) {
			for (const frame of decoder.finish()) {
				assertPong(frame);
				return;
			}
			throw new Error("Raw connection ended before pong");
		}
		for (const frame of decoder.push(chunk)) {
			assertPong(frame);
			return;
		}
	}
}

/** 使用 C 的真实成员和 RPC 消费方注入的 codec 执行同一工作负载。 */
export async function runOwnedReaderWriterPingPong(
	connection: OwnedReaderWriter.IPhysicalConnection,
	codec: IFrameCodec,
): Promise<void> {
	const decoder = codec.createDecoder();
	await connection.writer.ready;
	await connection.writer.write(codec.encode(PING_FRAME));

	for (;;) {
		const result = await connection.reader.read();
		if (result.done) {
			for (const frame of decoder.finish()) {
				assertPong(frame);
				await connection.writer.close();
				return;
			}
			throw new Error("Owned reader ended before pong");
		}
		if (result.value === undefined) {
			throw new Error("Owned reader returned no bytes before EOF");
		}
		for (const frame of decoder.push(result.value)) {
			assertPong(frame);
			await connection.writer.close();
			return;
		}
	}
}

/** 只做编译检查的比较入口：不执行评分，也不评选胜出方案。 */
export async function runPingPongComparison(
	completeFrame: CompleteFrameAsyncIterable.IPhysicalConnection,
	rawByte: RawByteReadWrite.IPhysicalConnection,
	ownedHandles: OwnedReaderWriter.IPhysicalConnection,
	rawCodec: IFrameCodec,
): Promise<void> {
	await runCompleteFramePingPong(completeFrame);
	await runRawBytePingPong(rawByte, rawCodec);
	await runOwnedReaderWriterPingPong(ownedHandles, rawCodec);
}

function assertPong(frame: Uint8Array): void {
	if (
		frame.length !== PONG_FRAME.length ||
		frame.some((byte, index) => byte !== PONG_FRAME[index])
	) {
		throw new Error("RPC ping received a non-pong frame");
	}
}
