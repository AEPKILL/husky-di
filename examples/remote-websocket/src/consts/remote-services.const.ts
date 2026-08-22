/**
 * @overview Remote Service Descriptors shared by the Web and Node applications.
 * @author AEPKILL
 * @created 2026-08-20 23:09:54
 */

import { createRemoteServiceDescriptor } from "@husky-di/remote";

import { IBrowserDisplayService } from "@/interfaces/browser-display-service.interface";
import { IGreetingService } from "@/interfaces/greeting-service.interface";

export const REMOTE_BROWSER_DISPLAY_SERVICE = createRemoteServiceDescriptor(
	IBrowserDisplayService,
	{
		wireName: "example.browser-display.v1",
		methods: { showMessage: true },
	},
);

export const REMOTE_GREETING_SERVICE = createRemoteServiceDescriptor(
	IGreetingService,
	{
		wireName: "example.greeting.v1",
		methods: {
			greet: true,
			greetCancelable: { cancelable: true },
		},
	},
);
