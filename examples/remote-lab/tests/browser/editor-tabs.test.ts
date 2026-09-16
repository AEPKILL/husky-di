/**
 * @overview Verifies VS Code icon-label tab geometry, visual states and source navigation in the rendered workbench.
 * @author AEPKILL
 * @created 2026-09-16 22:14:28
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 Monaco tab labels match the reference geometry and visual states", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	const tab = page.getByRole("tab", { name: "remote.case.ts", exact: true });
	await expect(tab).toHaveAttribute("aria-selected", "true");
	await page.getByRole("button", { name: "Toggle observation panel" }).hover();
	const outer = tab.locator("..");
	const fill = outer.locator(".tab-fill");
	const close = outer.getByRole("button", { name: "Close remote.case.ts" });
	await expect(outer).toHaveCSS("height", "32px");
	await expect(outer).toHaveCSS("box-shadow", "none");
	await expect(fill).toHaveCSS("height", "24px");
	await expect(fill).toHaveCSS("border-radius", "4px");
	await expect(fill).toHaveCSS("background-color", "rgb(44, 56, 61)");
	await expect(tab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(tab).toHaveCSS("color", "rgb(223, 245, 243)");
	await expect(tab).toHaveCSS("font-size", "13px");
	await expect(tab).toHaveCSS("font-weight", "400");
	await expect(tab).toHaveCSS("letter-spacing", "normal");
	await expect(tab).toHaveCSS("line-height", "24px");
	await expect(close).toHaveCSS("width", "20px");
	await expect(close).toHaveCSS("height", "20px");
	const geometry = await outer.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const label = element.querySelector(".tab-label") as HTMLElement;
		const fill = element.querySelector(".tab-fill") as HTMLElement;
		const name = element.querySelector(".label-name") as HTMLElement;
		const icon = getComputedStyle(label, "::before");
		return {
			labelX: label.getBoundingClientRect().x - bounds.x,
			labelY: label.getBoundingClientRect().y - bounds.y,
			nameX: name.getBoundingClientRect().x - bounds.x,
			fillX: fill.getBoundingClientRect().x - bounds.x,
			fillWidth: bounds.width - fill.getBoundingClientRect().width,
			icon: [icon.width, icon.height, icon.paddingRight, icon.backgroundSize],
		};
	});
	expect(geometry).toEqual({
		labelX: 6,
		labelY: 4,
		nameX: 28,
		fillX: 2,
		fillWidth: 4,
		icon: ["16px", "24px", "6px", "16px 16px"],
	});
	// The CSS image must decode successfully, not merely have a URL in a rule.
	expect(
		await tab.evaluate(async (element) => {
			const image = new Image();
			image.src = getComputedStyle(element, "::before").backgroundImage.slice(
				5,
				-2,
			);
			await image.decode();
			return image.naturalWidth > 0;
		}),
	).toBe(true);
	const files = page.getByRole("navigation", {
		name: "Project files",
		exact: true,
	});
	await files
		.getByRole("button", { name: "services/client.ts", exact: true })
		.click();
	await expect(tab).toHaveAttribute("aria-selected", "false");
	await expect(tab).toHaveCSS("color", "rgba(204, 204, 204, 0.5)");
	await expect(fill).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(close).toBeHidden();
	const widthBefore = (await outer.boundingBox())?.width;
	await tab.hover();
	await expect(tab).toHaveCSS("color", "rgb(167, 182, 184)");
	await expect(fill).toHaveCSS("background-color", "rgb(44, 56, 61)");
	await expect(close).toBeVisible();
	await close.hover();
	await expect(close).toHaveCSS("background-color", "rgba(90, 93, 94, 0.31)");
	expect((await outer.boundingBox())?.width).toBe(widthBefore);
	await page.getByRole("button", { name: "Explorer", exact: true }).hover();
	await tab.focus();
	await expect(close).toBeVisible();
	await tab.press("Enter");
	await expect(tab).toHaveAttribute("aria-selected", "true");
});

test("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 overflowing tabs keep their width and reveal newly active source", async ({
	page,
}) => {
	await page.setViewportSize({ width: 900, height: 700 });
	await page.goto("/");
	const files = page.getByRole("navigation", {
		name: "Project files",
		exact: true,
	});
	await expect(files.getByRole("button").first()).toBeVisible();
	for (const file of await files.getByRole("button").all()) await file.click();
	const tabs = page.getByRole("tablist", { name: "Open source files" });
	await expect(tabs.getByRole("tab")).toHaveCount(8);
	const active = tabs.locator('[role="tab"][aria-selected="true"]');
	const lastPath = await active.getAttribute("title");
	for (const theme of ["dark", "light"]) {
		await page
			.getByRole("combobox", { name: "Workbench theme" })
			.selectOption(theme);
		const bounds = await tabs.evaluate((element) => {
			const box = element.getBoundingClientRect();
			const selected = element
				.querySelector(".platform-editor-tab.active .tab-fill")
				?.getBoundingClientRect();
			return {
				overflow: element.scrollWidth > element.clientWidth,
				scroll: element.scrollLeft,
				selectedRight: selected?.right,
				right: box.right,
				heights: [...element.children].map(
					(child) => child.getBoundingClientRect().height,
				),
			};
		});
		expect(bounds.overflow).toBe(true);
		expect(bounds.scroll).toBeGreaterThan(0);
		// The painted fill (inset 2px), including its close action, stays visible.
		expect(bounds.selectedRight).toBeLessThanOrEqual(bounds.right);
		expect(bounds.heights.every((height) => height === 32)).toBe(true);
	}
	await page
		.getByRole("button", { name: `Close ${lastPath}`, exact: true })
		.press("Space");
	await expect(tabs.getByRole("tab")).toHaveCount(7);
	await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(
		1,
	);
	await files
		.getByRole("button", { name: "remote.case.ts", exact: true })
		.click();
	await expect(tabs).toHaveJSProperty("scrollLeft", 0);
	await expect(
		tabs.getByRole("tab", { name: "remote.case.ts", exact: true }),
	).toHaveAttribute("aria-selected", "true");
});
