/**
 * @overview Wire descriptors for Remote Lab business, exposure, and callback scenarios.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
 */

import { createRemoteServiceDescriptor } from "@husky-di/remote";
import {
	ILabBrowserService,
	ILabService,
	IPeerLabService,
	IShippingService,
} from "@/interfaces/lab-service.interface";

export const LAB_SERVICE_NAMES = {
	lab: "example.lab.v1",
	shipping: "example.shipping.v1",
	peer: "example.peer-lab.v1",
	browser: "example.lab-browser.v1",
} as const;

export const LAB_MEMBERS = {
	quote: { kind: "function" },
	echo: { kind: "function" },
	fail: { kind: "function" },
	report: { kind: "function", cancelable: true },
	resume: { kind: "function" },
	identify: { kind: "function" },
	identifyServer: { kind: "function" },
	setGlobalExposure: { kind: "function" },
	setPeerExposure: { kind: "function" },
	conflict: { kind: "function" },
	callback: { kind: "function" },
	fanout: { kind: "function" },
} as const;

export const REMOTE_LAB_SERVICE = createRemoteServiceDescriptor(ILabService, {
	wireName: LAB_SERVICE_NAMES.lab,
	members: LAB_MEMBERS,
});

export const REMOTE_SHIPPING_SERVICE = createRemoteServiceDescriptor(
	IShippingService,
	{
		wireName: LAB_SERVICE_NAMES.shipping,
		members: { quote: { kind: "function" } },
	},
);

export const REMOTE_PEER_LAB_SERVICE = createRemoteServiceDescriptor(
	IPeerLabService,
	{
		wireName: LAB_SERVICE_NAMES.peer,
		members: { inspect: { kind: "function" } },
	},
);

export const REMOTE_LAB_BROWSER_SERVICE = createRemoteServiceDescriptor(
	ILabBrowserService,
	{
		wireName: LAB_SERVICE_NAMES.browser,
		members: { receive: { kind: "function" } },
	},
);
