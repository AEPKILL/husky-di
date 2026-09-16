/**
 * @overview Exercises native Monaco split geometry, sash input and retained pane state across layout transitions.
 * @author AEPKILL
 * @created 2026-09-16 22:53:54
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 asynchronous editor loading leaves project input focused", async ({
	page,
}) => {
	let releaseEditor = () => {};
	const editorGate = new Promise<void>((resolve) => {
		releaseEditor = resolve;
	});
	await page.route("**/src/web/platform/project-editor.tsx*", async (route) => {
		await editorGate;
		await route.continue();
	});
	try {
		await page.goto("/");
		const input = page.getByRole("textbox", { name: "Local project path" });
		await input.fill("/tmp/project-in-progress");
		releaseEditor();
		await expect(page.locator(".monaco-editor")).toBeVisible();
		await expect(input).toBeFocused();
		await page.keyboard.insertText("-continued");
		await expect(input).toHaveValue("/tmp/project-in-progress-continued");
	} finally {
		releaseEditor();
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 native SplitView owns pane geometry and retains manual sizes", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1370, height: 900 });
	await page.goto("/");
	await expect(page.locator(".monaco-editor")).toBeVisible();
	await expect(
		page.locator(".platform-split-view > .monaco-split-view2"),
	).toHaveCount(3);
	await expect(page.locator('[data-slot="resizable-panel-group"]')).toHaveCount(
		0,
	);
	const sidebar = page.locator("#project-tree");
	const sash = page.getByRole("separator", { name: "Resize project sidebar" });
	const geometry = await sidebar.evaluate((element) => {
		const first = element.parentElement;
		if (!first?.parentElement) throw new Error("Missing native split view");
		const second = first.nextElementSibling;
		if (!second) throw new Error("Missing adjacent native view");
		const a = first.getBoundingClientRect(),
			b = second.getBoundingClientRect();
		return {
			container: first.parentElement.className,
			view: first.className,
			position: getComputedStyle(first).position,
			gap: b.left - a.right,
			total: a.width + b.width,
			available: first.parentElement.clientWidth,
		};
	});
	expect(geometry.container).toBe("split-view-container");
	expect(geometry.view).toBe("split-view-view visible");
	expect(geometry.position).toBe("absolute");
	expect(geometry.gap).toBe(0);
	expect(geometry.total).toBe(geometry.available);
	await expect(sash).toHaveCSS("width", "4px");
	const before = await sash.getAttribute("aria-valuenow");
	const bounds = await sash.boundingBox();
	if (!bounds) throw new Error("Missing resize sash");
	await page.mouse.move(bounds.x + 2, bounds.y + 50);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 82, bounds.y + 50, { steps: 8 });
	await page.mouse.up();
	await expect(sash).not.toHaveAttribute("aria-valuenow", before ?? "");
	const resized = await sidebar.evaluate(
		(element) => element.getBoundingClientRect().width,
	);
	const editor = await page.locator(".monaco-editor").elementHandle();
	await editor?.evaluate((element) =>
		element.setAttribute("data-split-instance", "retained"),
	);
	const toggle = page.getByRole("button", { name: "Toggle project sidebar" });
	await toggle.click();
	await expect(sidebar).toBeHidden();
	await expect(sidebar).toHaveCSS("display", "none");
	await expect(
		page.getByRole("separator", {
			name: "Resize project sidebar",
			includeHidden: true,
		}),
	).toBeHidden();
	await toggle.click();
	await expect(sidebar).toBeVisible();
	expect(
		await sidebar.evaluate((element) => element.getBoundingClientRect().width),
	).toBeCloseTo(resized, 0);
	await expect(page.locator(".monaco-editor")).toHaveAttribute(
		"data-split-instance",
		"retained",
	);
	await sash.focus();
	await sash.press("Home");
	await expect(sash).toHaveAttribute("aria-valuenow", "14");
	await sash.press("End");
	await expect(sash).toHaveAttribute("aria-valuenow", "50");
	await sash.dblclick();
	await expect(sash).toHaveAttribute("aria-valuenow", "22");
	await page.getByRole("button", { name: "Toggle observation panel" }).click();
	const horizontal = page.getByRole("separator", {
		name: "Resize data flow panel",
	});
	await expect(horizontal).toHaveAttribute("aria-orientation", "horizontal");
	await horizontal.focus();
	const heightBefore = await horizontal.getAttribute("aria-valuenow");
	await horizontal.press("ArrowUp");
	await expect(horizontal).not.toHaveAttribute(
		"aria-valuenow",
		heightBefore ?? "",
	);
	await page.setViewportSize({ width: 1100, height: 760 });
	await expect(sash).toHaveAttribute("aria-valuenow", "22");
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
		1100,
	);
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 compact native views preserve the editor and disable hidden sashes", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(page.locator(".monaco-editor")).toBeVisible();
	await page
		.locator(".monaco-editor")
		.evaluate((element) =>
			element.setAttribute("data-split-instance", "retained"),
		);
	const input = page.getByRole("textbox", {
		name: "TypeScript source editor",
		exact: true,
	});
	await input.focus();
	// Automatic panel transitions must preserve focus in a pane that stays visible.
	for (let transition = 0; transition < 2; transition++) {
		await page
			.getByRole("button", { name: "Toggle observation panel" })
			.evaluate((button) => (button as HTMLButtonElement).click());
		await expect(input).toBeFocused();
	}
	await page.setViewportSize({ width: 360, height: 800 });
	const panes = page.getByRole("navigation", { name: "Workbench panes" });
	for (const button of await panes.getByRole("button").all()) {
		await button.click();
		await expect(button).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByRole("separator")).toHaveCount(0);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBe(360);
	}
	await page.getByRole("button", { name: "Focus editor", exact: true }).click();
	await expect(page.locator(".monaco-editor")).toBeVisible();
	await expect(page.locator(".monaco-editor")).toHaveAttribute(
		"data-split-instance",
		"retained",
	);
	await page
		.getByRole("combobox", { name: "Workbench theme" })
		.selectOption("dark");
	await page.setViewportSize({ width: 1370, height: 900 });
	await expect(
		page.getByRole("separator", { name: "Resize project sidebar" }),
	).toBeVisible();
	await expect(page.locator(".monaco-editor")).toHaveAttribute(
		"data-split-instance",
		"retained",
	);
	expect(errors).toEqual([]);
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 dark pane frames match VS Code borders and spacing", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1370, height: 1087 });
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	await expect(page.locator(".monaco-editor")).toBeVisible();
	const activity = page.locator(".platform-activity-bar");
	const sidebar = page.locator(".platform-sidebar");
	const source = page.locator(".platform-source");
	await expect(activity).toHaveCSS("border-radius", "8px 0px 0px 8px");
	await expect(sidebar).toHaveCSS("border-radius", "0px 8px 8px 0px");
	await expect(sidebar).toHaveCSS("border-left-color", "rgba(0, 0, 0, 0)");
	for (const pane of [activity, sidebar, source]) {
		await expect(pane).toHaveCSS("border-top", "1px solid rgb(51, 61, 66)");
		await expect(pane).toHaveCSS("border-bottom", "1px solid rgb(51, 61, 66)");
	}
	await expect(source).toHaveCSS("border-radius", "8px");
	await expect(source).toHaveCSS("overflow", "hidden");
	await expect(page.locator(".platform-footer")).toHaveCSS(
		"border-top-width",
		"0px",
	);
	const box = async (selector: string) =>
		page.locator(selector).evaluate((element) => {
			const r = element.getBoundingClientRect();
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
		});
	const a = await box(".platform-activity-bar"),
		b = await box(".platform-sidebar"),
		s = await box(".platform-source"),
		f = await box(".platform-footer");
	expect(a.left).toBe(4);
	expect(a.right).toBe(b.left);
	expect(a.top).toBe(35);
	expect(a.bottom).toBe(b.bottom);
	expect(s.left - b.right).toBe(4);
	expect(1370 - s.right).toBe(4);
	expect(s.bottom).toBe(a.bottom);
	expect(f.top - s.bottom).toBe(4);
	await page
		.getByRole("button", { name: "Toggle run inspector", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Toggle observation panel", exact: true })
		.click();
	for (const selector of [".platform-run", ".platform-evidence"]) {
		await expect(page.locator(selector)).toHaveCSS("border-radius", "8px");
		await expect(page.locator(selector)).toHaveCSS(
			"border",
			"1px solid rgb(51, 61, 66)",
		);
	}
	const editor = await box(".platform-source"),
		run = await box(".platform-run"),
		evidence = await box(".platform-evidence");
	expect(run.left - editor.right).toBe(4);
	expect(evidence.top - editor.bottom).toBe(4);
	expect(editor.bottom).toBe(run.bottom);
	expect(evidence.left).toBe(editor.left);
	expect(evidence.right).toBe(run.right);
	expect(f.top - evidence.bottom).toBe(4);
	await page.getByRole("button", { name: "Toggle project sidebar" }).click();
	await expect(activity).toHaveCSS("border-radius", "8px");
	expect((await box(".platform-source")).left - a.right).toBe(4);
});
