/**
 * @overview Publishes saved source without overwriting an IDE replacement and retains displaced conflicting bytes for explicit resolution.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createHash, randomUUID } from "node:crypto";
import {
	link,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
	PlatformSaveResult,
	PlatformSourceFile,
} from "@/types/platform-project.type";

export async function writePlatformSource(
	rootPath: string,
	path: string,
	content: string,
	expectedRevision: string,
): Promise<PlatformSaveResult> {
	const destination = resolve(rootPath, path);
	const temporary = join(
		dirname(destination),
		`.remote-lab-save-${randomUUID()}`,
	);
	const displaced = `${temporary}.previous`;
	let captured = false;
	const source = async (file: string): Promise<PlatformSourceFile | null> => {
		try {
			const bytes = await readFile(file);
			return {
				path,
				content: bytes.toString("utf8"),
				revision: createHash("sha256").update(bytes).digest("hex"),
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	};
	const restoreIfAbsent = async () => {
		try {
			await link(displaced, destination);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	};
	const preserveConflict = async (): Promise<PlatformSaveResult> => {
		await restoreIfAbsent();
		const preserved = await source(displaced);
		const preservedPath = join(
			rootPath,
			".remote-lab/conflicts",
			`${randomUUID()}.source`,
		);
		await mkdir(dirname(preservedPath), { recursive: true });
		await rename(displaced, preservedPath);
		captured = false;
		const disk = await source(destination);
		return {
			saved: false,
			file: disk,
			conflict: {
				draft: content,
				disk,
				...(preserved
					? {
							preserved: {
								...preserved,
								path: relative(rootPath, preservedPath),
							},
						}
					: {}),
			},
		};
	};
	try {
		await writeFile(temporary, content, {
			flag: "wx",
			flush: true,
			mode: (await stat(destination)).mode,
		});
		// An abrupt service exit between capture and publication leaves the original .previous bytes and draft temporary file for manual recovery.
		try {
			await rename(destination, displaced);
			captured = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			return {
				saved: false,
				file: null,
				conflict: { draft: content, disk: null },
			};
		}
		if ((await source(displaced))?.revision !== expectedRevision)
			return await preserveConflict();
		try {
			// Exclusive publication never replaces a pathname recreated by an IDE after the previous version was captured.
			await link(temporary, destination);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			return await preserveConflict();
		}
		// An IDE holding the old inode can still edit it during publication; retain those observed bytes rather than discard them.
		if ((await source(displaced))?.revision !== expectedRevision)
			return await preserveConflict();
		await rm(displaced);
		captured = false;
		return {
			saved: true,
			file: {
				path,
				content,
				revision: createHash("sha256").update(content).digest("hex"),
			},
		};
	} catch (error) {
		if (captured) await preserveConflict();
		throw error;
	} finally {
		await rm(temporary, { force: true });
	}
}
