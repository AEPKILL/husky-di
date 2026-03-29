/**
 * @overview Repository commit message validation tests.
 * @author AEPKILL
 * @created 2026-03-29 23:01:00
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const temporaryDirectoryPaths: string[] = [];
const currentFilePath = fileURLToPath(import.meta.url);
const repositoryRootDirectoryPath = resolve(dirname(currentFilePath), "../..");

afterEach(() => {
	while (temporaryDirectoryPaths.length > 0) {
		const directoryPath = temporaryDirectoryPaths.pop();
		if (directoryPath) {
			rmSync(directoryPath, { recursive: true, force: true });
		}
	}
});

function createCommitMessageFile(commitMessage: string): string {
	const directoryPath = mkdtempSync(join(tmpdir(), "commit-message-"));
	temporaryDirectoryPaths.push(directoryPath);

	const filePath = join(directoryPath, "COMMIT_EDITMSG");
	writeFileSync(filePath, commitMessage);

	return filePath;
}

function runCommitMessageLint(commitMessage: string) {
	const commitMessageFilePath = createCommitMessageFile(commitMessage);

	return spawnSync(
		"pnpm",
		["lint:commit-message", "--", commitMessageFilePath],
		{
			cwd: repositoryRootDirectoryPath,
			encoding: "utf8",
		},
	);
}

function runCommitMessageHook(commitMessage: string) {
	const commitMessageFilePath = createCommitMessageFile(commitMessage);

	return spawnSync("sh", [".husky/commit-msg", commitMessageFilePath], {
		cwd: repositoryRootDirectoryPath,
		encoding: "utf8",
	});
}

describe("commit message validation", () => {
	it("accepts Angular-style commit messages", () => {
		const result = runCommitMessageLint(
			"feat: add commit message validation\n",
		);

		assert.equal(
			result.status,
			0,
			`Expected commit message lint to pass, but it failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	});

	it("rejects free-form commit messages", () => {
		const result = runCommitMessageLint("update stuff\n");
		const outputText = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

		assert.notEqual(
			result.status,
			0,
			"Expected commit message lint to reject an invalid commit message.",
		);
		assert.match(
			outputText,
			/type may not be empty|subject may not be empty/,
			`Expected commit message lint failure output to mention commitlint rules.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	});

	it("accepts Angular-style commit messages through the commit-msg hook", () => {
		const result = runCommitMessageHook("fix: validate commit messages\n");

		assert.equal(
			result.status,
			0,
			`Expected commit-msg hook to pass, but it failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	});

	it("rejects free-form commit messages through the commit-msg hook", () => {
		const result = runCommitMessageHook("update stuff\n");
		const outputText = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

		assert.notEqual(
			result.status,
			0,
			"Expected commit-msg hook to reject an invalid commit message.",
		);
		assert.match(
			outputText,
			/type may not be empty|subject may not be empty/,
			`Expected commit-msg hook failure output to mention commitlint rules.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	});
});
