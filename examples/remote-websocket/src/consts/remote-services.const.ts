/**
 * @overview Explicit wire contracts shared by browser and Node.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { createRemoteServiceDescriptor } from "@husky-di/remote";
import { IBrowserDisplayService } from "@/interfaces/browser-display-service.interface";
import { IGreetingService } from "@/interfaces/greeting-service.interface";

export const REMOTE_GREETING_SERVICE = createRemoteServiceDescriptor(
	IGreetingService,
	{
		wireName: "example.greeting.v1",
		methods: { greet: true, ready: true },
	},
);
export const REMOTE_BROWSER_DISPLAY_SERVICE = createRemoteServiceDescriptor(
	IBrowserDisplayService,
	{
		wireName: "example.browser-display.v1",
		methods: { showMessage: true },
	},
);
