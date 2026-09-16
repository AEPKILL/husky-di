/**
 * @overview Exercises the developer workbench against real files, optimistic saves, project language services and execution.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 activity navigation preserves source with auxiliary panels initially closed", async ({
	page,
}) => {
	const root = await createProject();
	try {
		await openProject(page, root);
		const editor = page.getByTestId("project-editor");
		const files = page.getByRole("navigation", {
			name: "Project files",
			exact: true,
		});
		const caseIcon = files
			.getByRole("button", { name: "answer.case.ts", exact: true })
			.locator("img");
		const sourceIcon = files
			.getByRole("button", { name: "helper.ts", exact: true })
			.locator("img");
		await expect(sourceIcon).toBeVisible();
		expect(await caseIcon.getAttribute("src")).not.toBe(
			await sourceIcon.getAttribute("src"),
		);
		const tabLabel = page.getByRole("tab", {
			name: "answer.case.ts",
			exact: true,
		});
		await expect(
			tabLabel.locator(".monaco-icon-label-container .label-name"),
		).toHaveText("answer.case.ts");
		expect(
			await tabLabel.evaluate(
				(label) => getComputedStyle(label, "::before").backgroundImage,
			),
		).not.toBe("none");
		await expect(tabLabel.locator("img")).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Explorer", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
		await expect(
			page.getByRole("button", { name: "Toggle run inspector", exact: true }),
		).toHaveAttribute("aria-expanded", "false");
		await expect(
			page.getByRole("button", {
				name: "Toggle observation panel",
				exact: true,
			}),
		).toHaveAttribute("aria-expanded", "false");
		await expect(
			page.getByRole("region", { name: "Execution steps and assertions" }),
		).not.toBeVisible();
		await page.getByRole("button", { name: "Testing", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Testing", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
		await page.getByText("Run Parameters · JSON", { exact: true }).click();
		await expect(
			page.getByRole("textbox", { name: "Run parameters JSON" }),
		).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: "Local project path" }),
		).not.toBeVisible();
		await expect(editor).toBeVisible();
		await page.getByRole("button", { name: "History", exact: true }).click();
		await expect(
			page.getByRole("textbox", { name: "Run parameters JSON" }),
		).not.toBeVisible();
		await expect(editor).toBeVisible();
		await page.getByRole("button", { name: "Explorer", exact: true }).click();
		await expect(
			page.getByRole("textbox", { name: "New file path" }),
		).toBeVisible();
		await expect(
			page.getByRole("tab", { name: "answer.case.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 Material themes persist overrides and keep Monaco edits and undo", async ({
	page,
}) => {
	const root = await createProject();
	try {
		await page.emulateMedia({ colorScheme: "dark" });
		await openProject(page, root);
		const theme = page.getByRole("combobox", { name: "Workbench theme" });
		await expect(theme).toHaveValue("system");
		await expect(page.locator(".platform-header")).toHaveCSS(
			"background-color",
			"rgb(34, 45, 50)",
		);
		await expect(page.locator(".monaco-editor-background").first()).toHaveCSS(
			"background-color",
			"rgb(38, 50, 56)",
		);
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "helper.ts", exact: true })
			.click();
		const originalEditor = await page.locator(".monaco-editor").elementHandle();
		await page
			.locator(".monaco-editor .view-lines")
			.click({ position: { x: 20, y: 10 } });
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("Shift+ArrowLeft");
		await page.keyboard.insertText("3");
		await expect(page.locator(".monaco-editor")).toContainText(
			"export const answer = 43;",
		);
		await expect
			.poll(() => readFile(join(root, "helper.ts"), "utf8"))
			.toBe("export const answer = 43;\n");
		await theme.selectOption("light");
		await expect(page.locator(".platform-header")).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await expect(page.locator(".monaco-editor-background").first()).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await page.emulateMedia({ colorScheme: "light" });
		await page.emulateMedia({ colorScheme: "dark" });
		await expect(page.locator(".platform-shell")).toHaveAttribute(
			"data-theme",
			"light",
		);
		await expect(page.locator(".monaco-editor")).toContainText(
			"export const answer = 43;",
		);
		expect(
			await originalEditor?.evaluate(
				(element) => element === document.querySelector(".monaco-editor"),
			),
		).toBe(true);
		await page
			.getByRole("textbox", { name: "TypeScript source editor", exact: true })
			.focus();
		await page.keyboard.press("Control+z");
		await expect(page.locator(".monaco-editor")).toContainText(
			"export const answer = 42;",
		);
		await expect
			.poll(() => readFile(join(root, "helper.ts"), "utf8"))
			.toBe("export const answer = 42;\n");
		await expect(page.getByTestId("save-status")).toContainText("All saved");
		await page.reload();
		await expect(theme).toHaveValue("light");
		await expect(page.locator(".monaco-editor-background").first()).toHaveCSS(
			"background-color",
			"rgb(255, 255, 255)",
		);
		await theme.selectOption("dark");
		await page.emulateMedia({ colorScheme: "light" });
		await expect(page.locator(".platform-shell")).toHaveAttribute(
			"data-theme",
			"dark",
		);
		await expect(page.locator(".monaco-editor-background").first()).toHaveCSS(
			"background-color",
			"rgb(38, 50, 56)",
		);
		await theme.selectOption("system");
		await expect(page.locator(".platform-shell")).toHaveAttribute(
			"data-theme",
			"light",
		);
		await page.reload();
		await expect(theme).toHaveValue("system");
		await page.emulateMedia({ colorScheme: "dark" });
		await expect(page.locator(".platform-shell")).toHaveAttribute(
			"data-theme",
			"dark",
		);
		await expect(page.locator(".monaco-editor-background").first()).toHaveCSS(
			"background-color",
			"rgb(38, 50, 56)",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 panel visibility follows run transitions while manual focus survives records and polling", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await writeFile(
			join(root, "answer.case.ts"),
			`export const labCase = {
 title: "Panel visibility transitions",
 async run(ctx) {
  await ctx.step("Live records", async () => {
   for (let index = 0; index < 8; index++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    ctx.log("Live record " + index);
   }
  });
  await ctx.step("Retain failure", async () => {
   await new Promise(resolve => setTimeout(resolve, 1500));
   ctx.assert(false, "Failure reveals inspection");
  });
 }
};\n`,
		);
		await openProject(page, root);
		const inspector = page.getByRole("button", {
			name: "Toggle run inspector",
			exact: true,
		});
		const observation = page.getByRole("button", {
			name: "Toggle observation panel",
			exact: true,
		});
		const focusEditor = page.getByRole("button", {
			name: "Focus editor",
			exact: true,
		});
		await page.getByRole("button", { name: "Step Debug", exact: true }).click();
		await expect(page.getByTestId("run-state")).toHaveText("paused", {
			timeout: 20_000,
		});
		await expect(inspector).toHaveAttribute("aria-expanded", "true");
		await expect(observation).toHaveAttribute("aria-expanded", "true");
		const runId = await page.locator(".platform-run-id").textContent();
		await focusEditor.click();
		await expect(page.getByTestId("workbench-run-status")).toHaveAttribute(
			"title",
			new RegExp(runId ?? "missing-run"),
		);
		await expect(page.getByTestId("workbench-run-status")).toContainText(
			"paused",
		);
		for (let poll = 0; poll < 2; poll++)
			await page.waitForResponse(
				(response) =>
					response.request().method() === "GET" &&
					response.url().endsWith("/runs"),
			);
		await expect(inspector).toHaveAttribute("aria-expanded", "false");
		await expect(observation).toHaveAttribute("aria-expanded", "false");
		await inspector.click();
		await page.getByRole("button", { name: "Next", exact: true }).click();
		await expect(page.getByTestId("run-state")).toHaveText("running");
		await focusEditor.click();
		await expect(page.locator(".platform-records")).toContainText(
			"Live record 2",
		);
		await expect(page.getByTestId("workbench-run-status")).toContainText(
			"running",
		);
		await expect(inspector).toHaveAttribute("aria-expanded", "false");
		await expect(observation).toHaveAttribute("aria-expanded", "false");
		await expect(page.getByTestId("run-state")).toHaveText("paused");
		await expect(inspector).toHaveAttribute("aria-expanded", "true");
		await expect(observation).toHaveAttribute("aria-expanded", "true");
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(page.getByTestId("run-state")).toHaveText("running");
		await focusEditor.click();
		await expect(page.getByTestId("run-result")).toHaveText("failed");
		await expect(page.getByTestId("run-state")).toHaveText("retained");
		await expect(inspector).toHaveAttribute("aria-expanded", "true");
		await expect(observation).toHaveAttribute("aria-expanded", "true");
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await focusEditor.click();
		await page.getByRole("button", { name: "Step Debug", exact: true }).click();
		await expect(page.locator(".platform-run-id")).not.toHaveText(runId ?? "");
		await expect(page.getByTestId("run-state")).toHaveText("paused", {
			timeout: 20_000,
		});
		await expect(inspector).toHaveAttribute("aria-expanded", "true");
		await expect(observation).toHaveAttribute("aria-expanded", "true");
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 compact panel toggles reopen once and paused execution returns from source", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await writeFile(
			join(root, "answer.case.ts"),
			`export const labCase = {
 title: "Compact pause navigation",
 async run(ctx) {
  await ctx.step("Allow pause request", async () => {
   await new Promise(resolve => setTimeout(resolve, 2500));
  });
  await ctx.step("Pause boundary", async () => ctx.assert(false, "Retain failed history"));
 }
};\n`,
		);
		await page.setViewportSize({ width: 360, height: 800 });
		await openProject(page, root);
		const source = page
			.getByRole("navigation", { name: "Workbench panes" })
			.getByRole("button", { name: "Code", exact: true });
		const inspector = page.getByRole("button", {
			name: "Toggle run inspector",
			exact: true,
		});
		const observation = page.getByRole("button", {
			name: "Toggle observation panel",
			exact: true,
		});
		const execution = page.getByRole("region", {
			name: "Execution steps and assertions",
		});
		await inspector.click();
		await expect(execution).toBeVisible();
		await source.click();
		await expect(inspector).toHaveAttribute("aria-expanded", "false");
		await inspector.click();
		await expect(execution).toBeVisible();
		await observation.click();
		await expect(
			page.getByRole("region", { name: "Run data flow and logs" }),
		).toBeVisible();
		await source.click();
		await expect(observation).toHaveAttribute("aria-expanded", "false");
		await observation.click();
		await expect(
			page.getByRole("region", { name: "Run data flow and logs" }),
		).toBeVisible();
		await source.click();
		await page.getByRole("button", { name: "Step Debug", exact: true }).click();
		await expect(page.getByTestId("run-state")).toHaveText("paused", {
			timeout: 20_000,
		});
		await expect(execution).toBeVisible();
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(page.getByTestId("run-state")).toHaveText("running");
		await page.getByRole("button", { name: "Pause", exact: true }).click();
		await page
			.getByRole("button", { name: "Focus editor", exact: true })
			.click();
		await expect(page.getByTestId("project-editor")).toBeVisible();
		await expect(page.getByTestId("run-state")).toHaveText("paused");
		await expect(execution).toBeVisible();
		await expect(inspector).toHaveAttribute("aria-expanded", "true");
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(page.getByTestId("run-result")).toHaveText("failed");
		await expect(page.getByTestId("run-state")).toHaveText("retained");
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await page.getByRole("button", { name: "History", exact: true }).click();
		await page
			.locator(".platform-history-item")
			.filter({ hasText: "answer.case.ts" })
			.click();
		await expect(page.getByTestId("project-editor")).toBeVisible();
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
		await page
			.getByRole("button", { name: "Focus editor", exact: true })
			.click();
		await expect(page.getByTestId("project-editor")).toBeVisible();
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("project models retain edits and undo across closing tabs; project diagnostics navigate imports", async ({
	page,
}) => {
	const root = await createProject();
	try {
		await openProject(page, root);
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "helper.ts", exact: true })
			.click();
		await page
			.locator(".monaco-editor .view-lines")
			.click({ position: { x: 20, y: 10 } });
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("Shift+ArrowLeft");
		await page.keyboard.insertText("3");
		await expect
			.poll(() => readFile(join(root, "helper.ts"), "utf8"))
			.toBe("export const answer = 43;\n");
		await page
			.getByRole("button", { name: "Close helper.ts", exact: true })
			.click();
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "helper.ts", exact: true })
			.click();
		await page
			.getByRole("textbox", { name: "TypeScript source editor", exact: true })
			.focus();
		await page.keyboard.press("Control+z");
		await expect
			.poll(() => readFile(join(root, "helper.ts"), "utf8"))
			.toBe("export const answer = 42;\n");
		await replaceSource(page, "export const answer: number = 'wrong';\n");
		await page.getByRole("button", { name: /TypeScript Diagnostics/ }).click();
		await expect(
			page.getByLabel("Project TypeScript diagnostics"),
		).toContainText("TS2322");
		await page
			.getByLabel("Project TypeScript diagnostics")
			.getByRole("button", { name: /helper.ts · TS2322/ })
			.click();
		await expect(
			page.getByRole("tab", { name: "helper.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("failed saves retain drafts and block old-source runs; IDE conflicts preserve both versions until resolution", async ({
	page,
}) => {
	const root = await createProject();
	try {
		await openProject(page, root);
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "helper.ts", exact: true })
			.click();
		await page.route("**/api/platform/projects/*/files?*", async (route) => {
			if (route.request().method() === "PUT")
				await route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ error: "Disk temporarily unavailable" }),
				});
			else await route.continue();
		});
		await replaceSource(page, "export const answer = 44;\n");
		await expect(page.getByTestId("save-status")).toContainText("failed");
		let starts = 0;
		page.on("request", (request) => {
			if (request.method() === "POST" && request.url().endsWith("/runs"))
				starts += 1;
		});
		await page.getByRole("button", { name: "Run Test", exact: true }).click();
		await expect(
			page
				.getByRole("alert")
				.filter({ hasText: "Disk temporarily unavailable" }),
		).toBeVisible();
		expect(starts).toBe(0);
		expect(await readFile(join(root, "helper.ts"), "utf8")).toBe(
			"export const answer = 42;\n",
		);
		await writeFile(join(root, "helper.ts"), "export const answer = 99;\n");
		await page.unroute("**/api/platform/projects/*/files?*");
		await expect(page.getByTestId("disk-conflict-content")).toContainText("99");
		await expect(page.locator(".monaco-editor")).toContainText("44");
		await page.getByRole("button", { name: "Run Test", exact: true }).click();
		expect(starts).toBe(0);
		await page
			.getByRole("button", {
				name: "Keep Editor Content and Save",
				exact: true,
			})
			.click();
		await expect
			.poll(() => readFile(join(root, "helper.ts"), "utf8"))
			.toBe("export const answer = 44;\n");
		await expect(page.getByTestId("save-status")).toContainText("All saved");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("debug uses an immutable import snapshot, shares controls across pages and reruns saved current code", async ({
	page,
	context,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await openProject(page, root);
		await page.getByRole("button", { name: "Step Debug", exact: true }).click();
		await expect(page.getByTestId("run-state")).toHaveText("paused", {
			timeout: 20_000,
		});
		const firstRun = await page.locator(".platform-run-id").textContent();
		await writeFile(join(root, "helper.ts"), "export const answer = 43;\n");
		const observer = await context.newPage();
		await observer.goto(page.url());
		await expect(observer.locator(".platform-run-id")).toHaveText(
			firstRun ?? "",
		);
		await expect(
			observer.getByRole("button", { name: "Run Test", exact: true }),
		).toBeDisabled();
		await observer
			.getByRole("button", { name: "Continue", exact: true })
			.click();
		await expect(page.getByTestId("run-result")).toHaveText("passed", {
			timeout: 20_000,
		});
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await page
			.getByRole("button", { name: "View Execution Snapshot", exact: true })
			.click();
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
		await expect(page.locator(".platform-source-context")).toContainText(
			"Read-only source snapshot",
		);
		await page
			.getByRole("button", { name: "Rerun Current Code", exact: true })
			.click();
		await expect(page.locator(".platform-run-id")).not.toHaveText(
			firstRun ?? "",
		);
		await expect(page.getByTestId("run-state")).toHaveText("paused", {
			timeout: 20_000,
		});
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(page.getByTestId("run-result")).toHaveText("failed", {
			timeout: 20_000,
		});
		await expect(page.getByTestId("run-state")).toHaveText("retained");
		await expect(
			page.getByRole("button", { name: "Continue", exact: true }),
		).toBeDisabled();
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await observer.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a newly authored draft runs without assertions and is reported unverified", async ({
	page,
	context,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await openProject(page, root);
		await page
			.getByRole("textbox", { name: "New file path" })
			.fill("draft.case.ts");
		await page
			.getByRole("button", { name: "New File / Case", exact: true })
			.click();
		await expect(
			page.getByRole("combobox", { name: "Selected TypeScript case" }),
		).toHaveValue("draft.case.ts");
		await page.getByRole("button", { name: "Run Test", exact: true }).click();
		await expect(page.getByTestId("run-result")).toHaveText(
			"Unverified · unverified",
			{ timeout: 20_000 },
		);
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await page.reload();
		await page.getByRole("button", { name: "History", exact: true }).click();
		let starts = 0;
		page.on("request", (request) => {
			if (request.method() === "POST" && request.url().endsWith("/runs"))
				starts += 1;
		});
		await page
			.locator(".platform-history-item")
			.filter({ hasText: "draft.case.ts" })
			.click();
		await expect(page.getByTestId("run-result")).toHaveText(
			"Unverified · unverified",
		);
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
		await expect(
			page.getByRole("button", { name: "Toggle run inspector", exact: true }),
		).toHaveAttribute("aria-expanded", "true");
		await expect(
			page.getByRole("button", {
				name: "Toggle observation panel",
				exact: true,
			}),
		).toHaveAttribute("aria-expanded", "true");
		expect(starts).toBe(0);
		const historyId = await page.locator(".platform-run-id").textContent();
		await page
			.getByRole("button", { name: "Focus editor", exact: true })
			.click();
		const observer = await context.newPage();
		await observer.goto(page.url());
		await expect(
			observer.getByRole("combobox", { name: "Selected TypeScript case" }),
		).toHaveValue("answer.case.ts");
		await observer
			.getByRole("button", { name: "Step Debug", exact: true })
			.click();
		await expect(observer.getByTestId("run-state")).toHaveText("paused", {
			timeout: 20_000,
		});
		const activeId = await observer.locator(".platform-run-id").textContent();
		await expect(
			page.getByRole("button", { name: "Observe active run", exact: true }),
		).toBeVisible();
		await expect(page.locator(".platform-run-id")).toHaveText(historyId ?? "");
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
		await expect(
			page.getByRole("button", { name: "Toggle run inspector", exact: true }),
		).toHaveAttribute("aria-expanded", "true");
		await page
			.getByRole("button", { name: "Observe active run", exact: true })
			.click();
		await expect(page.locator(".platform-run-id")).toHaveText(activeId ?? "");
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await observer.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Run flushes an immediate edit and language navigation resolves project imports", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await openProject(page, root);
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "helper.ts", exact: true })
			.click();
		await replaceSource(page, "export const answer = 43;\n");
		await page.getByRole("button", { name: "Run Test", exact: true }).click();
		await expect(page.getByTestId("run-result")).toHaveText("failed", {
			timeout: 20_000,
		});
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		expect(await readFile(join(root, "helper.ts"), "utf8")).toBe(
			"export const answer = 43;\n",
		);
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "answer.case.ts", exact: true })
			.click();
		await replaceSource(page, 'import { answer } from "./helper";\nanswer;\n');
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("Home");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("F12");
		await expect(
			page.getByRole("tab", { name: "helper.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the workbench links real Chromium and Node wire records, logs, owners and step source", async ({
	page,
}) => {
	test.setTimeout(90_000);
	const root = await createProject();
	try {
		await cp(fileURLToPath(new URL("../../cases", import.meta.url)), root, {
			recursive: true,
			filter: (path) => basename(path) !== ".remote-lab",
		});
		await openProject(page, root);
		await page
			.getByRole("combobox", { name: "Selected TypeScript case" })
			.selectOption("remote.case.ts");
		await page.getByRole("button", { name: "Run Test", exact: true }).click();
		await expect(page.getByTestId("run-result")).toHaveText("passed", {
			timeout: 45_000,
		});
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await page.getByRole("tab", { name: "Network", exact: true }).click();
		await expect(
			page.locator(".platform-records tbody tr").first(),
		).toBeVisible();
		await page.locator(".platform-record-summary").first().click();
		await expect(page.locator(".platform-record-detail")).toContainText(
			'"kind": "wire"',
		);
		await page
			.getByRole("tab", { name: "Owners / State", exact: true })
			.click();
		await expect(
			page.locator(".platform-records tbody tr").first(),
		).toBeVisible();
		await page.getByRole("tab", { name: "Logs", exact: true }).click();
		await expect(page.locator(".platform-records")).toContainText(
			"Adapted specification sources",
		);
		await page.locator(".platform-step-list button").first().click();
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
		await expect(page.locator(".platform-context")).not.toContainText(
			"all steps",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

for (const width of [360, 736, 1024]) {
	for (const colorScheme of ["light", "dark"] as const) {
		test(`responsive workbench ${width}px ${colorScheme} keeps source, keyboard controls and independent panes usable`, async ({
			page,
		}, testInfo) => {
			const root = await createProject();
			try {
				await Promise.all(
					Array.from({ length: 24 }, (_, index) =>
						writeFile(
							join(root, `helper-${index}.ts`),
							`export const value${index} = ${index};\n`,
						),
					),
				);
				await page.setViewportSize({ width, height: 800 });
				await page.emulateMedia({ colorScheme });
				await openProject(page, root);
				await expect(
					page.locator(
						`.monaco-editor.${colorScheme === "dark" ? "vs-dark" : "vs"}`,
					),
				).toBeVisible();
				await expect(page.locator(".platform-header")).toHaveCSS(
					"background-color",
					colorScheme === "dark" ? "rgb(34, 45, 50)" : "rgb(255, 255, 255)",
				);
				const editor = page.getByTestId("project-editor");
				const original = await editor.boundingBox();
				expect(original?.width).toBeGreaterThan(width < 760 ? width - 60 : 300);
				expect(original?.height).toBeGreaterThan(200);
				if (width < 760) {
					const caseSelector = await page
						.getByRole("combobox", { name: "Selected TypeScript case" })
						.boundingBox();
					// The selector fills the toolbar inside the pane's border and canvas insets.
					const toolbarContentWidth = await page
						.locator(".platform-run-toolbar")
						.evaluate((element) => {
							const style = getComputedStyle(element);
							return (
								element.clientWidth -
								Number.parseFloat(style.paddingLeft) -
								Number.parseFloat(style.paddingRight)
							);
						});
					expect(caseSelector?.width).toBeCloseTo(toolbarContentWidth, 0);
					const panes = page.getByRole("navigation", {
						name: "Workbench panes",
					});
					await panes
						.getByRole("button", { name: "Project / Cases", exact: true })
						.focus();
					await page.keyboard.press("Enter");
					await expect(
						page.getByRole("textbox", { name: "New file path" }),
					).toBeVisible();
					await page.locator(".platform-sidebar").evaluate((element) => {
						element.scrollTop = element.scrollHeight;
					});
					await expect
						.poll(() =>
							page
								.locator(".platform-sidebar")
								.evaluate((element) => element.scrollTop),
						)
						.toBeGreaterThan(0);
					await page
						.getByRole("navigation", { name: "Project files", exact: true })
						.getByRole("button", { name: "helper.ts", exact: true })
						.focus();
					await page.keyboard.press("Enter");
					await expect(
						page.getByRole("tab", { name: "helper.ts", exact: true }),
					).toHaveAttribute("aria-selected", "true");
					await panes
						.getByRole("button", {
							name: "Execution / Assertions",
							exact: true,
						})
						.click();
					await expect(
						page.getByRole("region", {
							name: "Execution steps and assertions",
						}),
					).toBeVisible();
					await panes
						.getByRole("button", { name: "Data Flow / Logs", exact: true })
						.click();
					await expect(
						page.getByRole("textbox", { name: "Filter execution records" }),
					).toBeVisible();
					await panes
						.getByRole("button", { name: "Code", exact: true })
						.click();
					await expect(editor).toBeVisible();
				} else {
					await page.locator(".platform-sidebar").evaluate((element) => {
						element.scrollTop = element.scrollHeight;
					});
					await expect
						.poll(() =>
							page
								.locator(".platform-sidebar")
								.evaluate((element) => element.scrollTop),
						)
						.toBeGreaterThan(0);
					expect((await editor.boundingBox())?.y).toBe(original?.y);
					const separator = page.getByRole("separator", {
						name: "Resize project sidebar",
					});
					const before = await separator.getAttribute("aria-valuenow");
					await separator.focus();
					await page.keyboard.press("ArrowRight");
					await expect(separator).not.toHaveAttribute(
						"aria-valuenow",
						before ?? "",
					);
				}
				await expect
					.poll(() =>
						page.evaluate(
							() => document.documentElement.scrollWidth - window.innerWidth,
						),
					)
					.toBeLessThanOrEqual(1);
				await page.screenshot({
					path: testInfo.outputPath(`platform-${width}-${colorScheme}.png`),
				});
				await page.emulateMedia({
					colorScheme: colorScheme === "dark" ? "light" : "dark",
				});
				await expect(
					page.locator(
						`.monaco-editor.${colorScheme === "dark" ? "vs" : "vs-dark"}`,
					),
				).toBeVisible();
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		});
	}
}

async function createProject(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "remote-lab-ui-project-"));
	await Promise.all([
		writeFile(join(root, "helper.ts"), "export const answer = 42;\n"),
		writeFile(
			join(root, "answer.case.ts"),
			`import type { ILabCase } from "@husky-di/example-remote-lab/sdk";
import { answer } from "./helper";
export const labCase: ILabCase = {
 title: "Answer from project helper",
 async run(ctx) {
  await ctx.step("Check saved helper", async () => { ctx.assert(answer === 42, "helper answer", answer, 42); });
 }
};\n`,
		),
	]);
	return root;
}

async function openProject(page: Page, root: string): Promise<void> {
	await page.goto("/");
	const panes = page.getByRole("navigation", { name: "Workbench panes" });
	if (await panes.isVisible())
		await panes
			.getByRole("button", { name: "Project / Cases", exact: true })
			.click();
	await page.getByRole("textbox", { name: "Local project path" }).fill(root);
	await page
		.getByRole("button", { name: "Open Local Project", exact: true })
		.click();
	await expect(
		page.getByRole("combobox", { name: "Selected TypeScript case" }),
	).toHaveValue("answer.case.ts");
	await expect(
		page.getByRole("tab", { name: "answer.case.ts", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("textbox", {
			name: "TypeScript source editor",
			exact: true,
		}),
	).toBeAttached();
}

async function replaceSource(page: Page, source: string): Promise<void> {
	await page
		.locator(".monaco-editor .view-lines")
		.click({ position: { x: 20, y: 10 } });
	// The Desktop Chrome fixture declares a Windows user agent, which owns Monaco keybindings.
	await page.keyboard.press("Control+a");
	await page.keyboard.insertText(source);
}
