/**
 * @overview Names execution IPC messages and independent case result states.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

export enum LabExecutionCommandEnum {
	start = "start",
	pause = "pause",
	continue = "continue",
	step = "step",
	stop = "stop",
	timeout = "timeout",
}

export enum LabExecutionEventEnum {
	ready = "ready",
	state = "state",
	step = "step",
	assertion = "assertion",
	record = "record",
	caseResult = "case-result",
	completed = "completed",
	cleanup = "cleanup",
	error = "error",
}

export enum LabExecutionModeEnum {
	test = "test",
	debug = "debug",
}

export enum LabExecutionStateEnum {
	running = "running",
	paused = "paused",
	retained = "retained",
	stopping = "stopping",
}

export enum LabCaseOutcomeEnum {
	passed = "passed",
	failed = "failed",
	unverified = "unverified",
	interrupted = "interrupted",
}

export enum LabNodeKindEnum {
	node = "node",
	browser = "browser",
}
