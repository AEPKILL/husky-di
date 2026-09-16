/**
 * @overview Verifies the bounded Observable stream experiment used by the Lab UI.
 * @author AEPKILL
 * @created 2026-09-13 23:08:57
 */

import { it } from "node:test";
import { LabSourceEnum } from "@/enums/lab-recording.enum";
import {
	LabStreamKindEnum,
	LabStreamNetworkKindEnum,
	LabStreamStatusEnum,
} from "@/enums/lab-stream.enum";
import { createLabStreamExperiment } from "@/utils/create-lab-stream-experiment.util";

it("EXAMPLE-LAB-STREAM-001 keeps method subscriptions independent", () => {
	const experiment = createLabStreamExperiment();
	experiment.open(LabStreamKindEnum.method);
	experiment.open(LabStreamKindEnum.method);
	experiment.next("one");

	const snapshot = experiment.snapshot();
	if (snapshot.streams.length !== 2)
		throw new Error("Expected two independent stream subscriptions.");
	if (!snapshot.streams.every((stream) => stream.values.join() === "one"))
		throw new Error("Each method stream must receive its own next value.");
	experiment.unsubscribeLatest();
	if (experiment.snapshot().streams[1]?.status !== LabStreamStatusEnum.canceled)
		throw new Error("Unsubscribe must cancel only the latest stream.");
	if (experiment.snapshot().streams[0]?.status !== LabStreamStatusEnum.open)
		throw new Error("Unsubscribe must leave sibling streams open.");
	const networkKinds = experiment.snapshot().networkEntries.map((entry) => {
		const payload = entry.transportMessage?.payload;
		return payload === undefined
			? ""
			: ((JSON.parse(payload) as { message?: { kind?: string } }).message
					?.kind ?? "");
	});
	if (
		!networkKinds.includes("stream-open") ||
		!networkKinds.includes("stream-next") ||
		!networkKinds.includes("stream-cancel")
	)
		throw new Error(
			"Network must retain stream open, next, and cancel records.",
		);
	if (
		experiment
			.snapshot()
			.networkEntries.some((entry) => entry.source !== LabSourceEnum.stream)
	)
		throw new Error("Stream Network records must be labelled STREAM.");
});

it("EXAMPLE-LAB-STREAM-001 shares static source lifecycle and terminals", () => {
	const experiment = createLabStreamExperiment();
	experiment.open(LabStreamKindEnum.static);
	experiment.open(LabStreamKindEnum.static);
	if (experiment.snapshot().staticSubscribers !== 2)
		throw new Error("Static source must track both subscriptions.");
	experiment.next("shared");
	if (
		!experiment
			.snapshot()
			.streams.every((stream) => stream.values[0] === "shared")
	)
		throw new Error("Static source must fan out one value to each subscriber.");
	experiment.complete();
	const snapshot = experiment.snapshot();
	if (
		!snapshot.streams.every(
			(stream) => stream.status === LabStreamStatusEnum.complete,
		)
	)
		throw new Error(
			"Source completion must terminate every static subscription.",
		);
	if (snapshot.staticSubscribers !== 0 || snapshot.staticSource !== "idle")
		throw new Error("The last static terminal must tear down its source.");
	if (
		!snapshot.networkEntries.some((entry) =>
			entry.transportMessage?.payload?.includes('"stream-complete"'),
		)
	)
		throw new Error("Network must retain static stream completion records.");
	const staticNetworkPayload = snapshot.networkEntries
		.map((entry) => entry.transportMessage?.payload ?? "")
		.join("\n");
	if (
		!staticNetworkPayload.includes(
			`"${LabStreamNetworkKindEnum.sourceConnect}"`,
		) ||
		!staticNetworkPayload.includes(
			`"${LabStreamNetworkKindEnum.sourceShare}"`,
		) ||
		!staticNetworkPayload.includes(
			`"${LabStreamNetworkKindEnum.sourceTeardown}"`,
		)
	)
		throw new Error("Network must retain static source lifecycle records.");
});

it("EXAMPLE-LAB-STREAM-001 replays bounded disconnect values and reports overflow", () => {
	const experiment = createLabStreamExperiment();
	experiment.open(LabStreamKindEnum.method);
	experiment.disconnect();
	experiment.next("queued");
	if (experiment.snapshot().retained !== 1)
		throw new Error("Disconnected streams must retain a bounded next value.");
	experiment.recover();
	if (experiment.snapshot().streams[0]?.values[0] !== "queued")
		throw new Error("Recovery must replay retained values in order.");
	if (experiment.snapshot().retained !== 0)
		throw new Error("Recovery must release retained values.");
	experiment.disconnect();
	experiment.overflow();
	if (experiment.snapshot().streams[0]?.terminal !== "error(unavailable)")
		throw new Error("Retained-byte overflow must use unavailable terminal.");
	const networkPayload = experiment
		.snapshot()
		.networkEntries.map((entry) => entry.transportMessage?.payload ?? "")
		.join("\n");
	if (
		!networkPayload.includes(`"${LabStreamNetworkKindEnum.disconnect}"`) ||
		!networkPayload.includes(`"${LabStreamNetworkKindEnum.recover}"`) ||
		!networkPayload.includes('"stream-error"')
	)
		throw new Error(
			"Network must retain disconnect, recovery, and stream error records.",
		);
});
