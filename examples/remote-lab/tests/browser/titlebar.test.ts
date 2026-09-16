/**
 * @overview Verifies measured VS Code titlebar geometry and the project, source, theme and layout controls it hosts.
 * @author AEPKILL
 * @created 2026-09-16 22:30:28
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 centered titlebar matches VS Code dimensions", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1370, height: 900 });
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	await expect(page.locator(".titlebar-project-name")).toContainText(
		"remote-lab-browser-cases-",
	);
	const header = page.locator(".platform-header");
	await expect(header).toHaveCSS("height", "35px");
	await expect(header).toHaveCSS("border-bottom-width", "0px");
	await expect(header).toHaveCSS("letter-spacing", "normal");
	await expect(header).toHaveCSS("background-color", "rgb(34, 45, 50)");
	const geometry = await header.evaluate((element) => {
		const selectors = [
			".titlebar-center",
			".command-center",
			".titlebar-project-center",
			".titlebar-action",
			".platform-header-actions",
			".platform-header-actions button",
		];
		return selectors.map((selector) => {
			const box = element.querySelector(selector)?.getBoundingClientRect();
			if (!box) throw new Error(`Missing titlebar element: ${selector}`);
			return [box.x, box.y, box.width, box.height];
		});
	});
	// Extracted from the reference's CDP DOM at the same 1370px viewport.
	expect(geometry).toEqual([
		[398.703125, -1, 572.59375, 37],
		[398.703125, 6.5, 572.59375, 24],
		[450.703125, 6.5, 520.59375, 24],
		[398.703125, 7.5, 22, 22],
		[1258, 1, 104, 35],
		[1258, 7.5, 22, 22],
	]);
	await expect(header.locator(".titlebar-icon").first()).toHaveCSS(
		"width",
		"16px",
	);
	await expect(header.locator(".titlebar-project-center")).toHaveCSS(
		"border-radius",
		"4px",
	);
	await expect(header.locator(".titlebar-project-name")).toHaveCSS(
		"font-size",
		"12px",
	);
	const focus = page.getByRole("button", { name: "Focus editor", exact: true });
	await focus.hover();
	await expect(focus).toHaveCSS("background-color", "rgba(90, 93, 94, 0.31)");
	await page.setViewportSize({ width: 1920, height: 900 });
	await expect(header.locator(".titlebar-project-center")).toHaveCSS(
		"width",
		"600px",
	);
	for (const width of [360, 736]) {
		await page.setViewportSize({ width, height: 800 });
		for (const theme of ["light", "dark"]) {
			await page
				.getByRole("combobox", { name: "Workbench theme" })
				.selectOption(theme);
			expect(
				await header.evaluate((element) =>
					[...element.querySelectorAll("button, select")].every((control) => {
						const bounds = control.getBoundingClientRect();
						return (
							bounds.left >= 0 &&
							bounds.right <= window.innerWidth &&
							bounds.height === 22
						);
					}),
				),
			).toBe(true);
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth),
			).toBe(width);
		}
	}
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 titlebar controls navigate source and preserve mounted panes", async ({
	page,
}) => {
	await page.goto("/");
	const previous = page.getByRole("button", { name: "Previous open source" });
	const next = page.getByRole("button", { name: "Next open source" });
	await expect(
		page.getByRole("tab", { name: "remote.case.ts", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(previous).toBeDisabled();
	await expect(next).toBeDisabled();
	await page
		.getByRole("navigation", { name: "Project files", exact: true })
		.getByRole("button", { name: "services/client.ts", exact: true })
		.click();
	await previous.click();
	await expect(
		page.getByRole("tab", { name: "remote.case.ts", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await next.focus();
	await next.press("Enter");
	await expect(
		page.getByRole("tab", { name: "client.ts", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(next).toBeDisabled();
	const sidebar = page.getByRole("button", { name: "Toggle project sidebar" });
	const editor = await page.locator(".monaco-editor").elementHandle();
	await sidebar.click();
	await expect(sidebar).toHaveAttribute("aria-expanded", "false");
	await expect(page.locator("#project-tree")).toBeHidden();
	await expect(
		page.getByRole("separator", {
			name: "Resize project sidebar",
			includeHidden: true,
		}),
	).toBeHidden();
	await sidebar.press("Space");
	await expect(sidebar).toHaveAttribute("aria-expanded", "true");
	await expect(page.locator("#project-tree")).toBeVisible();
	expect(await editor?.evaluate((element) => element.isConnected)).toBe(true);
	await page.getByRole("button", { name: "Testing", exact: true }).click();
	await sidebar.click();
	await page.getByRole("button", { name: "Open project explorer" }).click();
	await expect(
		page.getByRole("textbox", { name: "Local project path" }),
	).toBeFocused();
	await expect(
		page.getByRole("button", { name: "Explorer", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	const theme = page.getByRole("combobox", { name: "Workbench theme" });
	expect(
		await theme.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return (
				document.elementFromPoint(
					rect.x + rect.width - 8,
					rect.y + rect.height / 2,
				) === element
			);
		}),
	).toBe(true);
	await theme.selectOption("light");
	await theme.focus();
	await expect(theme).toBeFocused();
	await expect(theme).toHaveCSS("outline-width", "1px");
	await theme.selectOption("dark");
	await expect(theme).toHaveValue("dark");
	await expect(page.locator(".platform-shell")).toHaveAttribute(
		"data-theme",
		"dark",
	);
	await page.setViewportSize({ width: 360, height: 800 });
	await page.getByRole("button", { name: "Focus editor", exact: true }).click();
	await expect(sidebar).toHaveAttribute("aria-expanded", "false");
	await sidebar.click();
	await expect(sidebar).toHaveAttribute("aria-expanded", "true");
	await expect(page.locator("#project-tree")).toBeVisible();
	await sidebar.click();
	await expect(page.locator("#project-tree")).toBeHidden();
});
