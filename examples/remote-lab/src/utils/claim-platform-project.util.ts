/**
 * @overview Claims exclusive local project-service ownership without allowing another process to reinterpret live history as interrupted.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

export async function claimPlatformProject(
	rootPath: string,
): Promise<() => Promise<void>> {
	const root = await realpath(resolve(rootPath));
	const state = join(root, ".remote-lab");
	const lock = join(state, "project.lock");
	const token = randomUUID();
	const staging = join(state, `.project-lock-${token}`);
	await mkdir(staging, { recursive: true });
	await writeFile(
		join(staging, "owner.json"),
		JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }),
		{ flag: "wx", flush: true },
	);
	const readOwner = async (): Promise<ProjectOwner> =>
		JSON.parse(await readFile(join(lock, "owner.json"), "utf8"));
	try {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				// A fully initialized nonempty directory appears atomically; rename cannot replace another nonempty ownership directory.
				await rename(staging, lock);
				let released: Promise<void> | undefined;
				return () => {
					if (released) return released;
					released = (async () => {
						const owner = await readOwner().catch(
							(error: NodeJS.ErrnoException) => {
								if (error.code === "ENOENT") return undefined;
								throw error;
							},
						);
						if (owner?.token === token)
							await rm(lock, { recursive: true, force: true });
					})();
					return released;
				};
			} catch (error) {
				if (
					!["EEXIST", "ENOTEMPTY"].includes(
						(error as NodeJS.ErrnoException).code ?? "",
					)
				)
					throw error;
			}
			const owner = await readOwner();
			if (isProcessAlive(owner.pid))
				throw new Error(
					`Project is already owned by live service PID ${owner.pid}; connect to that service with CLI --url instead of opening a second service`,
				);
			const reclaim = join(lock, "reclaim");
			try {
				await mkdir(reclaim);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				if ((error as NodeJS.ErrnoException).code === "EEXIST")
					throw new Error(
						"Another service is recovering stale project ownership; retry connecting shortly",
					);
				throw error;
			}
			const latest = await readOwner();
			if (latest.token !== owner.token || isProcessAlive(latest.pid)) {
				await rm(reclaim, { recursive: true, force: true });
				throw new Error(
					"Project ownership changed during recovery; connect to the existing service with CLI --url",
				);
			}
			await rm(lock, { recursive: true });
		}
		throw new Error(
			"Project ownership changed repeatedly; connect to the existing service with CLI --url",
		);
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

type ProjectOwner = { pid: number; token: string; createdAt: number };

function isProcessAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0)
		throw new Error(
			"Project ownership file has an invalid PID; inspect .remote-lab/project.lock before reopening",
		);
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
		throw error;
	}
}
