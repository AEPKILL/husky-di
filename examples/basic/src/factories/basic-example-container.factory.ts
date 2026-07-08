/**
 * Basic example container factory.
 *
 * @overview
 * Builds and configures the container used by the runnable basic example entrypoint.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import {
	createContainer,
	type IContainer,
	LifecycleEnum,
} from "@husky-di/core";
import { ConsoleLoggerImpl } from "@/impls/console-logger.impl";
import { DefaultUserServiceImpl } from "@/impls/default-user-service.impl";
import { InMemoryUserRepositoryImpl } from "@/impls/in-memory-user-repository.impl";
import { IAppConfig } from "@/interfaces/app-config.interface";
import { IAppLogger, ILogger } from "@/interfaces/logger.interface";
import { IUserRepository } from "@/interfaces/user-repository.interface";
import { IUserService } from "@/interfaces/user-service.interface";

export function createBasicExampleContainer(): IContainer {
	const container = createContainer("BasicExampleContainer");

	container.register(IAppConfig, {
		useValue: {
			appName: "husky-di basic example",
			usersEndpoint: "https://api.example.com/users",
		},
	});

	container.register(ILogger, {
		useClass: ConsoleLoggerImpl,
		lifecycle: LifecycleEnum.singleton,
	});

	container.register(IAppLogger, {
		useAlias: ILogger,
	});

	container.register(IUserRepository, {
		useClass: InMemoryUserRepositoryImpl,
	});

	container.register(IUserService, {
		useClass: DefaultUserServiceImpl,
	});

	return container;
}
