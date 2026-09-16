/**
 * @overview Separates project run progress, verification, termination, and cleanup evidence.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

export enum PlatformRunStateEnum {
	starting = "starting",
	running = "running",
	paused = "paused",
	retained = "retained",
	stopping = "stopping",
	finished = "finished",
}

export enum PlatformRunResultEnum {
	pending = "pending",
	passed = "passed",
	failed = "failed",
	unverified = "unverified",
	interrupted = "interrupted",
	error = "error",
}

export enum PlatformTerminationEnum {
	pending = "pending",
	normal = "normal",
	forced = "forced",
	unexpected = "unexpected",
	unknown = "unknown",
}

export enum PlatformCleanupEnum {
	pending = "pending",
	complete = "complete",
	failed = "failed",
	unknown = "unknown",
}
