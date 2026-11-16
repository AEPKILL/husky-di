/**
 * @overview Separates deferred reference creation from access and ordinary resolve.
 * Each sample performs 10,000 operations; registration is outside timed batches.
 * @author AEPKILL
 * @created 2026-11-16 22:20:34
 */

import { bench, describe } from "vitest";
import { createContainer, type Ref } from "../../src/index";

const BATCH_SIZE = 10_000;
const BENCH_OPTIONS = {
	iterations: 20,
	time: 300,
	warmupIterations: 10,
	warmupTime: 100,
};

let _reference: Ref<number> | undefined;
let _value = 0;

for (const options of [{ ref: true }, { dynamic: true }] as const) {
	const name = "ref" in options ? "ref" : "dynamic";
	describe(`${name} creation`, () => {
		for (const registered of [false, true]) {
			const container = createContainer("ReferenceCreationBench");
			if (registered) {
				container.register("value", { useValue: 1 });
			}
			bench(
				`${registered ? "registered" : "missing"} (10,000 references)`,
				() => {
					for (let index = 0; index < BATCH_SIZE; index += 1) {
						_reference = container.resolve<number, typeof options>(
							"value",
							options,
						);
					}
				},
				BENCH_OPTIONS,
			);
		}
	});
}

describe("reference access and ordinary resolution", () => {
	const container = createContainer("ReferenceAccessBench");
	container.register("value", { useValue: 1 });
	bench(
		"ordinary value (10,000 resolves)",
		() => {
			for (let index = 0; index < BATCH_SIZE; index += 1) {
				_value ^= container.resolve<number>("value");
			}
		},
		BENCH_OPTIONS,
	);
	bench(
		"ref creation and first access (10,000 references)",
		() => {
			for (let index = 0; index < BATCH_SIZE; index += 1) {
				_value ^= container.resolve<number, { ref: true }>("value", {
					ref: true,
				}).current;
			}
		},
		BENCH_OPTIONS,
	);
	bench(
		"dynamic creation and 2 accesses (10,000 references)",
		() => {
			for (let index = 0; index < BATCH_SIZE; index += 1) {
				const reference = container.resolve<number, { dynamic: true }>(
					"value",
					{ dynamic: true },
				);
				_value ^= reference.current + reference.current;
			}
		},
		BENCH_OPTIONS,
	);
});
