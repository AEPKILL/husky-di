/**
 * @overview Verifies local file icon associations and non-draggable folder states.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { it } from "node:test";
import {
	MaterialFileIcon,
	MaterialFolderIcon,
} from "@/web/platform/material-file-icon";

it("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 Material file icons distinguish cases from source and fall back for unknown files", async () => {
	const files = [
		["remote.case.ts", "test-ts.svg"],
		["nested/remote.test.ts", "test-ts.svg"],
		["REMOTE.SPEC.TS", "test-ts.svg"],
		["services/client.ts", "typescript.svg"],
		["src/view.tsx", "typescript.svg"],
		["src/client.mjs", "javascript.svg"],
		["package.json", "json.svg"],
		["README.md", "markdown.svg"],
		["unknown.txt", "document.svg"],
	];
	for (const [path, asset] of files) {
		assert.ok(path);
		const icon = MaterialFileIcon({ path });
		assert.equal(new URL(icon.props.src).pathname.split("/").at(-1), asset);
		assert.equal(icon.props.alt, "");
		assert.equal(icon.props.draggable, false);
		await access(new URL(icon.props.src));
	}
});

it("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 Material folders use distinct bundled open and closed assets", async () => {
	const closed = MaterialFolderIcon({});
	const open = MaterialFolderIcon({ open: true });
	assert.notEqual(open.props.src, closed.props.src);
	for (const icon of [open, closed]) {
		assert.equal(icon.props.alt, "");
		assert.equal(icon.props.draggable, false);
		await access(new URL(icon.props.src));
	}
});
