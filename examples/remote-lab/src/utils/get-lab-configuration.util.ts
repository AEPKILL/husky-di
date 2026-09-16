/**
 * @overview Labels retained creation settings by explicit, normative-default, and role-derived provenance.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import {
	LAB_BROWSER_RUNTIME_POLICY,
	LAB_RECONNECTION_POLICY,
	LAB_RUNTIME_DEFAULTS,
} from "@/consts/lab-owner.const";
import type { LabOwnerConfiguration } from "@/types/lab-owner.type";

export function getLabConfiguration(
	browser: boolean,
	address: string,
): LabOwnerConfiguration[] {
	const explicit: Record<string, number> = browser
		? LAB_BROWSER_RUNTIME_POLICY
		: {};
	const derived: Record<string, number> = browser
		? {
				maxSessions: 1,
				maxHandshakes: 1,
				maxRetainedBytesTotal: LAB_RUNTIME_DEFAULTS.maxRetainedBytesPerSession,
				maxHandlersTotal: LAB_RUNTIME_DEFAULTS.maxHandlersPerSession,
			}
		: {};
	return [
		...Object.entries(LAB_RUNTIME_DEFAULTS).map(([name, value]) => ({
			name: `runtime.${name}`,
			value: String(explicit[name] ?? derived[name] ?? value),
			source:
				name in explicit
					? "explicit Lab input"
					: name in derived
						? "role-derived (RPC-POLICY-001)"
						: "specification default",
		})),
		{
			name: browser ? "Adapter.url" : "Adapter.listener",
			value: address,
			source: "explicit Lab input",
		},
		{ name: "Adapter.path", value: "/rpc", source: "explicit Lab input" },
		...(browser
			? Object.entries(LAB_RECONNECTION_POLICY).map(([name, value]) => ({
					name: `reconnection.${name}`,
					value: JSON.stringify(value),
					source: "explicit Lab input",
				}))
			: []),
	];
}
