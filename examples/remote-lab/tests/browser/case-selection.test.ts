/**
 * @overview Verifies that source navigation, explicit case selection and historical reruns submit the intended cases.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 source case navigation selects the case submitted by test and debug actions", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await openProject(page, root);
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "other.case.ts", exact: true })
			.click();
		await expect(
			page.getByRole("tab", { name: "other.case.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await submitRun(page, "Run Test", ["other.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");

		await page
			.getByRole("tab", { name: "answer.case.ts", exact: true })
			.click();
		await submitRun(page, "Step Debug", ["answer.case.ts"]);
		await expect(page.getByTestId("run-state")).toHaveText("paused");
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");

		await page
			.getByRole("button", { name: "Close answer.case.ts", exact: true })
			.click();
		await expect(
			page.getByRole("tab", { name: "other.case.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await page
			.getByRole("navigation", { name: "Project files", exact: true })
			.getByRole("button", { name: "helper.ts", exact: true })
			.click();
		await submitRun(page, "Run Test", ["other.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 Testing choices, all-case runs and historical reruns keep their explicit targets", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await openProject(page, root);
		await page.getByRole("button", { name: "Testing", exact: true }).click();
		await page
			.getByTestId("case-entry")
			.filter({ hasText: "other.case.ts" })
			.click();
		await submitRun(page, "Run Test", ["other.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");

		await page
			.getByRole("combobox", { name: "Selected TypeScript case" })
			.selectOption("answer.case.ts");
		await page.getByRole("button", { name: "History", exact: true }).click();
		await page
			.locator(".platform-history-item")
			.filter({ hasText: "other.case.ts" })
			.click();
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Historical source snapshot (read only)",
		);
		await expect(
			page.getByRole("combobox", { name: "Selected TypeScript case" }),
		).toHaveValue("answer.case.ts");
		await submitRun(page, "Rerun Current Code", ["other.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await expect(
			page.getByRole("combobox", { name: "Selected TypeScript case" }),
		).toHaveValue("other.case.ts");
		await expect(
			page.getByRole("tab", { name: "other.case.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");

		await submitRun(page, "Test All", ["answer.case.ts", "other.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 deleting the observed history restores the selected current case before another run", async ({
	page,
}) => {
	test.setTimeout(60_000);
	const root = await createProject();
	try {
		await openProject(page, root);
		await submitRun(page, "Run Test", ["answer.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
		await page
			.getByRole("combobox", { name: "Selected TypeScript case" })
			.selectOption("other.case.ts");
		await page.getByRole("button", { name: "History", exact: true }).click();
		const history = page
			.locator(".platform-history-row")
			.filter({ hasText: "answer.case.ts" });
		await history.locator(".platform-history-item").click();
		await expect(
			page.getByRole("tab", { name: "answer.case.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await history.getByRole("button", { name: /^Delete history / }).click();
		await expect(page.getByTestId("project-editor")).toHaveAttribute(
			"aria-label",
			"Current project source",
		);
		await expect(
			page.getByRole("tab", { name: "other.case.ts", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await submitRun(page, "Run Test", ["other.case.ts"]);
		await expect(page.getByTestId("run-result")).toHaveText("passed");
		await expect(page.getByTestId("run-cleanup")).toHaveText("complete");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

async function createProject(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "remote-lab-case-selection-"));
	await Promise.all([
		writeFile(join(root, "helper.ts"), "export const answer = 42;\n"),
		...["answer", "other"].map((name) =>
			writeFile(
				join(root, `${name}.case.ts`),
				`import type { ILabCase } from "@husky-di/example-remote-lab/sdk";
export const labCase: ILabCase = {
 title: "${name}",
 async run(ctx) {
  await ctx.step("Verify ${name}", async () => ctx.assert(true, "${name} executed"));
 }
};\n`,
			),
		),
	]);
	return root;
}

async function openProject(page: Page, root: string): Promise<void> {
	await page.goto("/");
	await expect(
		page.getByRole("combobox", { name: "Selected TypeScript case" }),
	).not.toHaveValue("");
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
}

async function submitRun(
	page: Page,
	action: string,
	entries: string[],
): Promise<void> {
	const submission = page.waitForRequest(
		(request) => request.method() === "POST" && request.url().endsWith("/runs"),
	);
	const response = page.waitForResponse(
		(result) =>
			result.request().method() === "POST" && result.url().endsWith("/runs"),
	);
	await page.getByRole("button", { name: action, exact: true }).click();
	expect((await submission).postDataJSON().entries).toEqual(entries);
	const report = await (await response).json();
	await expect(page.locator(".platform-run-id")).toHaveText(report.id);
}
