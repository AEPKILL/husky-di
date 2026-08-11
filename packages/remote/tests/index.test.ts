/**
 * @overview Remote package entry point smoke test.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

import { describe, expect, it } from "vitest";
import * as remote from "../src/index";

describe("@husky-di/remote", () => {
	it("should expose an empty public API", () => {
		expect(Object.keys(remote)).toEqual([]);
	});
});
