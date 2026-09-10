/**
 * @overview Wire descriptors for Remote Lab business, exposure, and callback scenarios.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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

export const LAB_METHODS = {
	quote: true,
	echo: true,
	fail: true,
	report: { cancelable: true },
	resume: true,
	identify: true,
	identifyServer: true,
	setGlobalExposure: true,
	setPeerExposure: true,
	conflict: true,
	callback: true,
	fanout: true,
} as const;

export const REMOTE_LAB_SERVICE = createRemoteServiceDescriptor(ILabService, {
	wireName: LAB_SERVICE_NAMES.lab,
	methods: LAB_METHODS,
});

export const REMOTE_SHIPPING_SERVICE = createRemoteServiceDescriptor(
	IShippingService,
	{
		wireName: LAB_SERVICE_NAMES.shipping,
		methods: { quote: true },
	},
);

export const REMOTE_PEER_LAB_SERVICE = createRemoteServiceDescriptor(
	IPeerLabService,
	{
		wireName: LAB_SERVICE_NAMES.peer,
		methods: { inspect: true },
	},
);

export const REMOTE_LAB_BROWSER_SERVICE = createRemoteServiceDescriptor(
	ILabBrowserService,
	{
		wireName: LAB_SERVICE_NAMES.browser,
		methods: { receive: true },
	},
);
