/**
 * @overview Gives every browser regression case a fresh Remote Lab environment.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
import { createLabEnvironment } from "@/factories/lab-environment.factory";
import { createPlatformService } from "@/factories/platform-service.factory";

export { expect };

export const test = base.extend({
	baseURL: async ({ browserName: _browserName }, use) => {
		const builtinRoot = await mkdtemp(
			join(tmpdir(), "remote-lab-browser-cases-"),
		);
		try {
			await cp(
				fileURLToPath(new URL("../../cases", import.meta.url)),
				builtinRoot,
				{
					recursive: true,
					filter: (path) => basename(path) !== ".remote-lab",
				},
			);
			const environment = await createLabEnvironment({
				watch: false,
				platform: createPlatformService({ builtinRoot }),
			});
			try {
				await use(environment.origin);
			} finally {
				await environment.shutdown();
			}
		} finally {
			await rm(builtinRoot, { recursive: true, force: true });
		}
	},
});

test.afterEach(async ({ context }) => {
	await Promise.all(
		context
			.pages()
			.map((page) => page.unrouteAll({ behavior: "ignoreErrors" })),
	);
	await context.unrouteAll({ behavior: "ignoreErrors" });
});
