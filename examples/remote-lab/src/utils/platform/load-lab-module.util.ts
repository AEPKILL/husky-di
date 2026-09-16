/**
 * @overview Loads saved project modules with their own TypeScript aliases and original module locations.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";

export async function loadLabModule(
	snapshotDir: string,
	entry: string,
): Promise<Record<string, unknown>> {
	const root = realpathSync(snapshotDir);
	const tsconfig = join(root, "tsconfig.json");
	if (!registered) {
		register({ tsconfig: existsSync(tsconfig) ? tsconfig : false });
		registered = true;
	}
	return import(pathToFileURL(realpathSync(entry)).href);
}

let registered = false;
