/**
 * @overview Verifies custom service workflows and persistent seven-panel navigation through the real Lab page.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import assert from "node:assert/strict";
import type { Page } from "@playwright/test";
import type { LabCustomSnapshot } from "@/types/lab-custom-services.type";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-DEVTOOLS-001 seven persistent panels retain Network Messages as the initial view", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(
		page.getByRole("tab", { name: "Network", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("button", { name: "Messages", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	for (const name of [
		"Network",
		"Flow",
		"Sources",
		"Services",
		"Console",
		"Acceptor / Connector",
		"E2E",
	]) {
		await page.getByRole("tab", { name, exact: true }).click();
		await expect(
			page.getByRole("tabpanel", { name, exact: true }),
		).toBeVisible();
	}
});

test("EXAMPLE-LAB-CUSTOM-001/003 saved definitions, retained facades and keyboard record return use real RPC", async ({
	page,
}) => {
	await openExperiment(page);
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText(
		"Wire Service Name is required",
	);
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.keyboard");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	await page
		.getByRole("button", { name: "Resolve Facade", exact: true })
		.press("Enter");
	await expect(page.getByLabel("Retained Facade")).not.toHaveValue("");
	const facade = await page.getByLabel("Retained Facade").inputValue();
	await page
		.getByLabel("Business Arguments JSON Array")
		.fill('["<b>safe result</b>", {"__proto__": 7}]');
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.press("Enter");
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"unknown-service",
	);
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.press("Enter");
	const result = page.locator("[data-custom-call]").first();
	await expect(result.locator("[data-custom-outcome]")).toContainText(
		"fulfilled",
	);
	await expect(result.locator("pre")).toContainText("<b>safe result</b>");
	await expect(result.locator("pre b")).toHaveCount(0);
	await expect(
		page.getByRole("tab", { name: "Services", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await result
		.getByRole("button", { name: "View Network Records", exact: true })
		.press("Enter");
	await expect(
		page.getByRole("tab", { name: "Network", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(page.locator(".network-grid .inspector")).toContainText(
		"custom.keyboard.echo",
	);
	await page
		.getByRole("button", { name: "Back to Custom Experiment", exact: true })
		.press("Enter");
	await expect(page.getByLabel("Retained Facade")).toHaveValue(facade);
	await expect(page.getByLabel("Business Arguments JSON Array")).toHaveValue(
		'["<b>safe result</b>", {"__proto__": 7}]',
	);
	await page
		.getByRole("button", { name: "Service Catalog", exact: true })
		.press("Enter");
	await expect(
		page.locator(".service-row").filter({ hasText: "custom.keyboard" }),
	).toContainText("exposed");
	await page
		.getByRole("button", { name: "Custom Experiment", exact: true })
		.press("Enter");
	await page
		.getByRole("button", { name: "Revoke Exposure", exact: true })
		.click();
	await expect(
		page.getByLabel("Wire Service Name", { exact: true }),
	).toBeEnabled();
	await page.getByLabel("Method 1 Name", { exact: true }).fill("replacement");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	await expect(page.getByLabel("Retained Facade")).toHaveValue(facade);
	await expect(page.getByLabel("CallMethod")).toHaveValue("echo");
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"unknown-method",
	);
});

test("EXAMPLE-LAB-CUSTOM-001 form boundaries reject malformed inputs and preserve exact names", async ({
	page,
}) => {
	await openExperiment(page);
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("  Exact.Name  ");
	await page.getByLabel("Method 1 Name", { exact: true }).fill("then");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText(
		"then is a reserved method name",
	);
	await page.getByLabel("Method 1 Name", { exact: true }).fill("__proto__");
	await page.getByLabel("Method 1 Delay ms", { exact: true }).fill("10001");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText("0 to 10000");
	await page.getByLabel("Method 1 Delay ms", { exact: true }).fill("0.5");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText("integer");
	await page.getByLabel("Method 1 Delay ms", { exact: true }).fill("0");
	await page
		.getByLabel("Method 1 Behavior", { exact: true })
		.selectOption("fixed");
	await page.getByLabel("Method 1 Fixed JSON", { exact: true }).fill("{");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText(
		"Fixed return JSON is invalid",
	);
	await page
		.getByLabel("Method 1 Fixed JSON", { exact: true })
		.fill('"<img src=x>"');
	await page.getByRole("button", { name: "Add Method", exact: true }).click();
	await page.getByLabel("Method 2 Name", { exact: true }).fill("__proto__");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText("Duplicate method name");
	await page
		.getByRole("button", { name: "Delete Method 2", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	await expect(
		page.getByLabel("Wire Service Name", { exact: true }),
	).toHaveValue("  Exact.Name  ");
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	await page
		.getByRole("button", { name: "Resolve Facade", exact: true })
		.click();
	await expect(page.getByLabel("CallMethod")).toHaveValue("__proto__");
	await page
		.getByLabel("Business Arguments JSON Array")
		.fill('{"not":"array"}');
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText("RPC not called");
	await expect(page.locator("[data-custom-call]")).toHaveCount(0);
	await page.getByLabel("Business Arguments JSON Array").fill("[]");
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"fulfilled",
	);
	await expect(page.locator("[data-custom-call] pre").first()).toHaveText(
		'"<img src=x>"',
	);
	await expect(page.locator("[data-custom-call] img")).toHaveCount(0);
});

test("EXAMPLE-LAB-CUSTOM-002/003 overlapping cancelable calls retain independent outcomes across revocation", async ({
	page,
}) => {
	await openExperiment(page);
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.overlap");
	await page.getByLabel("Exposure Target").selectOption("node-peer");
	await page.getByLabel("Method 1 Delay ms", { exact: true }).fill("1800");
	await page.getByLabel("Method 1 Cancelable", { exact: true }).check();
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	await page
		.getByRole("button", { name: "Resolve Facade", exact: true })
		.click();
	await page.getByLabel("Business Arguments JSON Array").fill('["first"]');
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await page.getByLabel("Business Arguments JSON Array").fill('["second"]');
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Cancel This Call", exact: true }),
	).toHaveCount(2);
	await page
		.getByRole("button", { name: "Cancel This Call", exact: true })
		.first()
		.click();
	await page
		.getByRole("button", { name: "Revoke Exposure", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"canceled",
	);
	await expect(page.locator("[data-custom-outcome]").nth(1)).toContainText(
		"fulfilled",
	);
	await expect(page.locator("[data-custom-call] pre").nth(1)).toContainText(
		"first",
	);
	await page.getByRole("tab", { name: "Console", exact: true }).click();
	await page.getByRole("tab", { name: "Services", exact: true }).click();
	await expect(page.getByLabel("Business Arguments JSON Array")).toHaveValue(
		'["second"]',
	);
	await page.locator("#clear-records").click();
	await expect(page.locator("[data-custom-call]")).toHaveCount(0);
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"unknown-service",
	);
});

test("EXAMPLE-LAB-CUSTOM-002/003 two pages reject stale edits and show directed Node caller evidence without widening Network", async ({
	page,
	context,
}) => {
	await openExperiment(page);
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.shared");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	const definitionId = await page.getByLabel("Saved Definition").inputValue();
	const second = await context.newPage();
	await openExperiment(second);
	await second.getByLabel("Saved Definition").selectOption(definitionId);
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.changed");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.locator(".custom-card").first()).toContainText(
		"Draft revision 2",
	);
	await second
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.stale");
	await second
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(
		second.getByRole("tabpanel", { name: "Services", exact: true }),
	).toContainText("stale-revision");
	await expect(
		second.getByLabel("Wire Service Name", { exact: true }),
	).toHaveValue("custom.stale");
	await second
		.getByRole("button", { name: "Load Latest Definition", exact: true })
		.click();
	await expect(
		second.getByLabel("Wire Service Name", { exact: true }),
	).toHaveValue("custom.changed");
	await second
		.getByRole("button", { name: "New Definition", exact: true })
		.click();
	await second.getByLabel("Exposure Target").selectOption("browser-peer");
	await second
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.other-browser");
	await second
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(second.getByLabel("Saved Definition")).not.toHaveValue("");
	await second
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		second.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	const secondId = (await second.locator("#peer-name").innerText()).split(
		" · ",
	)[0];
	await expect(
		page
			.getByLabel("Call Catalog")
			.locator("option")
			.filter({ hasText: "custom.other-browser" }),
	).toHaveCount(1);
	const source = await page
		.getByLabel("Call Catalog")
		.locator("option")
		.filter({ hasText: "custom.other-browser" })
		.getAttribute("value");
	assert(source, "Another page's advertised definition must be selectable");
	await page.getByLabel("Call Catalog").selectOption(source);
	await expect(page.getByLabel("CallTarget Peer")).toHaveValue(secondId);
	await page
		.getByRole("button", { name: "Resolve Facade", exact: true })
		.click();
	await page.getByLabel("Business Arguments JSON Array").fill('["cross-page"]');
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"fulfilled",
	);
	await page
		.getByRole("button", { name: "View Node Caller Details", exact: true })
		.first()
		.click();
	await expect(
		page.getByRole("region", { name: "Node Caller Details", exact: true }),
	).toContainText(
		"Browser handler details for another page must be viewed on the target page",
	);
	await expect(
		page.getByRole("tab", { name: "Services", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("region", { name: "Node Caller Details", exact: true }),
	).toContainText("cross-page");
	await page
		.getByRole("button", { name: "Back to Custom Experiment", exact: true })
		.click();
	await expect(page.getByLabel("Business Arguments JSON Array")).toHaveValue(
		'["cross-page"]',
	);
	await second.getByRole("tab", { name: "Network", exact: true }).click();
	await second
		.getByRole("button", { name: "Call", exact: true })
		.last()
		.click();
	await expect(second.locator(".network-table")).toContainText(
		"custom.other-browser.echo",
	);
	await second.close();
});

test("EXAMPLE-LAB-CUSTOM-004 a lost management response stays uncertain until an explicit receipt query", async ({
	page,
}) => {
	await openExperiment(page);
	let lost = false;
	let saves = 0;
	await page.route("**/api/custom", async (route) => {
		if (
			route.request().method() === "POST" &&
			route.request().postDataJSON().action === "save"
		) {
			saves += 1;
			if (!lost) {
				lost = true;
				await route.fetch();
				await route.abort("failed");
				return;
			}
		}
		await route.continue();
	});
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.receipt");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.locator(".custom-warning")).toContainText(
		"Result pending verification",
	);
	await expect(
		page
			.getByLabel("Saved Definition")
			.locator("option")
			.filter({ hasText: "custom.receipt" }),
	).toHaveCount(1);
	await expect(page.locator(".custom-warning")).toContainText(
		"Result pending verification",
	);
	await page
		.getByRole("button", { name: "Refresh Service State", exact: true })
		.click();
	await expect(page.locator(".custom-warning")).toHaveCount(0);
	await expect(
		page.getByRole("tabpanel", { name: "Services", exact: true }),
	).toContainText("Refresh confirmed the operation took effect");
	expect(saves).toBe(1);
});

test("EXAMPLE-LAB-CUSTOM-002 crossing endpoint ownership explicitly saves a copy and preserves the source", async ({
	page,
}) => {
	await openExperiment(page);
	await page
		.getByLabel("Wire Service Name", { exact: true })
		.fill("custom.copy");
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	const original = await page.getByLabel("Saved Definition").inputValue();
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(page.getByLabel("Exposure Target")).toBeDisabled();
	await page
		.getByRole("button", { name: "Revoke Exposure", exact: true })
		.click();
	await expect(page.getByLabel("Exposure Target")).toBeEnabled();
	await page.getByLabel("Exposure Target").selectOption("browser-peer");
	await expect(
		page.getByRole("tabpanel", { name: "Services", exact: true }),
	).toContainText("Cross-end target will be saved as a new definition");
	await page
		.getByRole("button", { name: "Save As Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue(original);
	await expect(
		page
			.getByLabel("Saved Definition")
			.locator("option")
			.filter({ hasText: "custom.copy" }),
	).toHaveCount(2);
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	await page
		.getByRole("button", { name: "Resolve Facade", exact: true })
		.click();
	await page
		.getByLabel("Business Arguments JSON Array")
		.fill('["local callback"]');
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"fulfilled",
	);
	await page
		.locator("[data-custom-call]")
		.first()
		.getByRole("button", { name: "View Network Records", exact: true })
		.click();
	await expect(
		page.getByRole("tab", { name: "Network", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await page
		.getByRole("button", { name: "Back to Custom Experiment", exact: true })
		.click();
	await page.getByLabel("Saved Definition").selectOption(original);
	await expect(page.getByLabel("Exposure Target")).toHaveValue("node-global");
	await expect(
		page.getByRole("button", { name: "Expose Service", exact: true }),
	).toBeEnabled();
});

test("EXAMPLE-LAB-CUSTOM-003 delayed same-revision pre-Clear observations cannot restore cleared results", async ({
	page,
}) => {
	await createNodeCallerResult(page, "custom.clear-observation");
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let observed!: () => void;
	const captured = new Promise<void>((resolve) => {
		observed = resolve;
	});
	let previous: LabCustomSnapshot | undefined;
	await page.route("**/api/custom", async (route) => {
		if (route.request().method() !== "GET") {
			await route.continue();
			return;
		}
		if (!previous) {
			previous = (await (await route.fetch()).json()) as LabCustomSnapshot;
			observed();
			await held;
		}
		// Deliberately repeat the captured response: no fresh custom GET can conceal resurrection.
		await route.fulfill({ json: previous });
	});
	await captured;
	const clearedResponse = page.waitForResponse((response) =>
		response.url().endsWith("/api/lab/records"),
	);
	await page.locator("#clear-records").click();
	const cleared = (await (await clearedResponse).json()) as {
		lab: LabServerSnapshot;
	};
	assert(previous);
	expect(cleared.lab.custom?.revision).toBe(previous.revision);
	expect(cleared.lab.custom?.observation).toBeGreaterThan(previous.observation);
	await expect(page.locator("[data-custom-call]")).toHaveCount(0);
	const lateResponse = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/custom") &&
			response.request().method() === "GET",
	);
	release();
	await lateResponse;
	await page.getByRole("tab", { name: "Flow", exact: true }).click();
	await page.getByRole("tab", { name: "Services", exact: true }).click();
	await page.waitForResponse((response) => response.url().endsWith("/api/lab"));
	await expect(page.locator("[data-custom-call]")).toHaveCount(0);
});

test("EXAMPLE-LAB-CUSTOM-004 a prior-instance response cannot replace the authoritative new Node snapshot", async ({
	page,
}) => {
	await createNodeCallerResult(page, "custom.previous-instance");
	const previous = (await (
		await page.request.get("/api/custom")
	).json()) as LabCustomSnapshot;
	const replacement = `${previous.instanceId}:replacement-observation`;
	await page.route("**/api/custom", async (route) => {
		if (route.request().method() === "GET")
			await route.fulfill({ json: previous });
		else await route.continue();
	});
	// Inject only the authoritative observation boundary; real runtime restart is covered by Lab specifications.
	await page.route("**/api/lab", async (route) => {
		const live = (await (await route.fetch()).json()) as LabServerSnapshot;
		await route.fulfill({
			json: {
				...live,
				instanceId: replacement,
				custom: {
					...live.custom,
					instanceId: replacement,
					observation: 1,
					revision: 0,
					observedAt: Date.now(),
					definitions: [],
					facades: [],
					calls: [],
					catalogs: [],
				},
			},
		});
	});
	await page.waitForResponse((response) => response.url().endsWith("/api/lab"));
	await expect(page.locator("[data-custom-call]")).toHaveCount(0);
	await page.waitForResponse((response) =>
		response.url().endsWith("/api/custom"),
	);
	await page.getByRole("tab", { name: "Flow", exact: true }).click();
	await page.getByRole("tab", { name: "Services", exact: true }).click();
	await expect(page.locator("[data-custom-call]")).toHaveCount(0);
	await expect(
		page.getByLabel("Retained Facade").locator("option"),
	).toHaveCount(1);
});

async function createNodeCallerResult(
	page: Page,
	wireName: string,
): Promise<void> {
	await openExperiment(page);
	await page.getByLabel("Exposure Target").selectOption("browser-peer");
	await page.getByLabel("Wire Service Name", { exact: true }).fill(wireName);
	await page
		.getByRole("button", { name: "Save Definition", exact: true })
		.click();
	await expect(page.getByLabel("Saved Definition")).not.toHaveValue("");
	await page
		.getByRole("button", { name: "Expose Service", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Revoke Exposure", exact: true }),
	).toBeEnabled();
	await page
		.getByRole("button", { name: "Resolve Facade", exact: true })
		.click();
	await page
		.getByRole("button", { name: "CallRetained Facade", exact: true })
		.click();
	await expect(page.locator("[data-custom-outcome]").first()).toContainText(
		"fulfilled",
	);
}

async function openExperiment(page: Page): Promise<void> {
	await page.goto("/legacy");
	await page.getByRole("button", { name: "Call", exact: true }).click();
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	await page.getByRole("tab", { name: "Services", exact: true }).click();
	await page
		.getByRole("button", { name: "Custom Experiment", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Save Definition", exact: true }),
	).toBeEnabled();
}
