/**
 * @overview Named DevTools workbench panels and request-detail views.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

export enum DevtoolsNetworkViewEnum {
	messages = "messages",
	calls = "calls",
}

export enum DevtoolsTimeSortEnum {
	ascending = "ascending",
	descending = "descending",
}

export enum DevtoolsPanelEnum {
	network = "Network",
	flow = "Flow",
	sources = "Sources",
	services = "Services",
	console = "Console",
	owners = "Acceptor / Connector",
	e2e = "E2E",
}

export enum DevtoolsDetailEnum {
	overview = "Overview",
	payload = "Payload",
	timing = "Timing",
}

export enum LabE2eEvidenceViewEnum {
	network = "Network",
	flow = "Flow",
	console = "Console",
	owner = "Owner",
}
