/**
 * @overview Names observable package scenarios and their execution outcomes.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

export enum LabE2eSuiteEnum {
	observablePackageScenarios = "observable-package-scenarios",
}

export enum LabE2ePackageEnum {
	remote = "@husky-di/remote",
	remoteWebSocket = "@husky-di/remote-websocket",
}

export enum LabE2eStatusEnum {
	running = "running",
	stopping = "stopping",
	passed = "passed",
	failed = "failed",
	stopped = "stopped",
	error = "error",
	incomplete = "incomplete",
}

export enum LabE2eTestStatusEnum {
	notRun = "not-run",
	running = "running",
	passed = "passed",
	failed = "failed",
	timedOut = "timed-out",
	interrupted = "interrupted",
}
