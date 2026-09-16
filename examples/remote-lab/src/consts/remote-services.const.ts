/**
 * @overview Explicit wire contracts shared by browser and Node.
 * @author AEPKILL
 * @created 2026-08-21 01:06:59
 */

import { createRemoteServiceDescriptor } from "@husky-di/remote";
import { IBrowserDisplayService } from "@/interfaces/browser-display-service.interface";
import { IGreetingService } from "@/interfaces/greeting-service.interface";

export const REMOTE_GREETING_SERVICE = createRemoteServiceDescriptor(
	IGreetingService,
	{
		wireName: "example.greeting.v1",
		members: {
			greet: { kind: "function" },
			ready: { kind: "function" },
		},
	},
);
export const REMOTE_BROWSER_DISPLAY_SERVICE = createRemoteServiceDescriptor(
	IBrowserDisplayService,
	{
		wireName: "example.browser-display.v1",
		members: { showMessage: { kind: "function" } },
	},
);
