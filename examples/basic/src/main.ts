/**
 * Basic example runnable entrypoint.
 *
 * @overview
 * Boots the basic example container and prints a simple user lookup flow.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { createBasicExampleContainer } from "@/factories/basic-example-container.factory";
import {
	type IAppConfig as AppConfigInterface,
	IAppConfig,
} from "@/interfaces/app-config.interface";
import { IAppLogger } from "@/interfaces/logger.interface";
import {
	IUserService,
	type IUserService as UserServiceInterface,
} from "@/interfaces/user-service.interface";

function bootstrap(): void {
	const container = createBasicExampleContainer();
	const appLogger = container.resolve(IAppLogger);
	const appConfig = container.resolve<AppConfigInterface>(IAppConfig);
	const userService = container.resolve<UserServiceInterface>(IUserService);

	appLogger.log("Bootstrapping husky-di basic example");
	console.log(`Application: ${appConfig.appName}`);
	console.log(`Result: ${userService.getUserSummary("u-1")}`);
}

bootstrap();
