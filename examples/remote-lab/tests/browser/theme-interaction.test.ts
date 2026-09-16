/**
 * @overview Checks theme pointer input, visible file selection and resizing affordances across panel layouts.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 theme pointer input remains usable with hidden panels", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await openWorkbench(page);
	const theme = page.getByRole("combobox", { name: "Workbench theme" });
	await expect(theme).toHaveValue("system");
	await theme.evaluate((element) => {
		element.addEventListener(
			"pointerdown",
			(event) => {
				element.setAttribute(
					"data-pointer-prevented",
					String(event.defaultPrevented),
				);
			},
			{ once: true },
		);
	});
	await theme.click();
	await expect(theme).toHaveAttribute("data-pointer-prevented", "false");
	await expect(theme).toBeFocused();
	// Headless Chromium on macOS does not dispatch keyboard input into native select popups.
	// The pointer focus assertion detects the resize handler preventing the native input.
	await theme.selectOption("light");
	await expect(page.locator(".platform-shell")).toHaveAttribute(
		"data-theme",
		"light",
	);
	await page.reload();
	await expect(theme).toHaveValue("light");
	await expect(page.locator(".platform-shell")).toHaveAttribute(
		"data-theme",
		"light",
	);
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 resize cursors and dragging follow visible separators", async ({
	page,
}) => {
	await openWorkbench(page);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const inspector = page.getByRole("button", {
		name: "Toggle run inspector",
		exact: true,
	});
	const evidence = page.getByRole("button", {
		name: "Toggle observation panel",
		exact: true,
	});
	await expectOrdinaryCursors(page);
	await inspector.click();
	await expectOrdinaryCursors(page);
	await evidence.click();
	await expectOrdinaryCursors(page);

	const separator = page.getByRole("separator", {
		name: "Resize project sidebar",
	});
	await separator.hover();
	await expect(separator).toHaveCSS("cursor", "ew-resize");
	const bounds = await separator.boundingBox();
	if (!bounds) throw new Error("Visible sidebar separator has no geometry");
	const before = await separator.getAttribute("aria-valuenow");
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(bounds.x + 48, bounds.y + bounds.height / 2, {
		steps: 5,
	});
	await page.mouse.up();
	await expect(separator).not.toHaveAttribute("aria-valuenow", before ?? "");
	await expectOrdinaryCursors(page);

	await inspector.click();
	await evidence.click();
	await expectOrdinaryCursors(page);
	await page.setViewportSize({ width: 360, height: 800 });
	await expectOrdinaryCursors(page);
	await page.setViewportSize({ width: 1280, height: 720 });
	await expectOrdinaryCursors(page);
	expect(errors).toEqual([]);
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 active file has a visible selection in both themes", async ({
	page,
}) => {
	await openWorkbench(page);
	const files = page.getByRole("navigation", {
		name: "Project files",
		exact: true,
	});
	const file = files.getByRole("button", {
		name: "websocket.case.ts",
		exact: true,
	});
	await file.click();
	await expect(file).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("combobox", { name: "Workbench theme" }).hover();
	for (const theme of ["light", "dark"]) {
		await page
			.getByRole("combobox", { name: "Workbench theme" })
			.selectOption(theme);
		await expect
			.poll(() =>
				file.evaluate((element) => getComputedStyle(element).backgroundColor),
			)
			.not.toBe("rgba(0, 0, 0, 0)");
		await expect(
			files.getByRole("button", { name: "remote.case.ts", exact: true }),
		).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	}
});

async function openWorkbench(page: Page): Promise<void> {
	await page.goto("/");
	await expect(
		page.getByRole("textbox", {
			name: "TypeScript source editor",
			exact: true,
		}),
	).toBeAttached();
}

async function expectOrdinaryCursors(page: Page): Promise<void> {
	for (const control of [
		page.getByRole("combobox", { name: "Workbench theme" }),
		page.getByRole("button", { name: "Explorer", exact: true }),
	]) {
		await control.hover();
		await expect
			.poll(() =>
				control.evaluate((element) => getComputedStyle(element).cursor),
			)
			.not.toMatch(/resize|grab|move/);
	}
}
