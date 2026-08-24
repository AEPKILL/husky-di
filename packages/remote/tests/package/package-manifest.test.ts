/**
 * @overview Release-document and workflow contract tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(packageRoot, "../..");

describe("RPC package release contract", () => {
	it("RPC-RELEASE-004 RPC-DOC-005 is the generated stable package state", () => {
		const manifest = JSON.parse(
			readFileSync(resolve(packageRoot, "package.json"), "utf8"),
		) as {
			readonly scripts: Readonly<Record<string, string>>;
			readonly version: string;
		};
		expect(manifest.version).toBe("1.0.0");
		expect(manifest.scripts).toMatchObject({
			"evidence:corpus-lock": expect.any(String),
			"evidence:pack-parity": expect.any(String),
			"test:release": expect.any(String),
			"test:reproducible-pack": expect.any(String),
		});

		const changelog = readFileSync(
			resolve(packageRoot, "CHANGELOG.md"),
			"utf8",
		);
		expect(changelog.match(/^## 1\.0\.0$/gmu)).toHaveLength(1);
		for (const text of [
			"0.0.0",
			"husky-di-rpc/1",
			"members",
			"Observable",
			"unknown-member",
			"maxApplicationWorkPerSession",
			"fresh Session",
		]) {
			expect(changelog).toContain(text);
		}
	});

	it("RPC-PKG-006 RPC-RELEASE-004 includes the normative and user documentation", () => {
		expect(readFileSync(resolve(packageRoot, "README.md"), "utf8")).toContain(
			"@husky-di/remote",
		);
		expect(
			readFileSync(resolve(packageRoot, "CHANGELOG.md"), "utf8"),
		).toContain("1.0.0");
		expect(readFileSync(resolve(packageRoot, "LICENSE"), "utf8")).toContain(
			"MIT License",
		);
	});

	it("RPC-RELEASE-004 has consumed the stable Changeset into package state", () => {
		const changesets = readdirSync(resolve(workspaceRoot, ".changeset"))
			.filter((name) => name.endsWith(".md") && name !== "README.md")
			.map((name) =>
				readFileSync(resolve(workspaceRoot, ".changeset", name), "utf8"),
			);
		expect(
			changesets.some((contents) =>
				contents.includes('"@husky-di/remote": major'),
			),
		).toBe(false);
	});

	it("RPC-RELEASE-012 RPC-RELEASE-023 publishes only the tested A tarball input", () => {
		const workflow = readFileSync(
			resolve(workspaceRoot, ".github/workflows/release.yml"),
			"utf8",
		);
		const version = workflow.indexOf("pnpm changeset:version");
		const release = workflow.indexOf(
			"pnpm --filter @husky-di/remote test:release",
		);
		const publish = workflow.indexOf('npm publish "$A_TGZ" --access public');
		expect(version).toBeGreaterThan(-1);
		expect(release).toBeGreaterThan(version);
		expect(publish).toBeGreaterThan(release);
		expect(workflow).not.toContain("changeset publish");
		expect(workflow).toContain(
			'echo "A_TGZ=$RUNNER_TEMP/husky-di-remote-1.0.0.tgz" >> "$GITHUB_ENV"',
		);
		expect(workflow).toContain(
			'echo "HUSKY_REMOTE_TGZ=$RUNNER_TEMP/husky-di-remote-1.0.0.tgz" >> "$GITHUB_ENV"',
		);
	});

	it("RPC-RELEASE-002 RPC-RELEASE-004 installs the locked browser engines before CI and release tests", () => {
		const installCommand =
			"pnpm --filter @husky-di/remote exec playwright install --with-deps chromium firefox webkit";
		for (const workflowPath of [
			".github/workflows/ci.yml",
			".github/workflows/release.yml",
		]) {
			const workflow = readFileSync(
				resolve(workspaceRoot, workflowPath),
				"utf8",
			);
			expect(workflow, workflowPath).toContain(installCommand);
			expect(workflow.indexOf(installCommand), workflowPath).toBeGreaterThan(
				workflow.indexOf("pnpm install --frozen-lockfile"),
			);
			expect(workflow.indexOf("run: pnpm test"), workflowPath).toBeGreaterThan(
				workflow.indexOf(installCommand),
			);
		}
	});
});
