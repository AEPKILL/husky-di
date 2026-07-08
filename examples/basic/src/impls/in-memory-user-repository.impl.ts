/**
 * In-memory user repository implementation for the basic example.
 *
 * @overview
 * Resolves configuration and logger services from the active container context
 * and returns user profiles from an in-memory record.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { resolve } from "@husky-di/core";
import { BASIC_USERS } from "@/consts/basic-users.const";
import {
	type IAppConfig as AppConfigInterface,
	IAppConfig,
} from "@/interfaces/app-config.interface";
import {
	ILogger,
	type ILogger as LoggerInterface,
} from "@/interfaces/logger.interface";
import type { IUserRepository } from "@/interfaces/user-repository.interface";
import type { UserProfile } from "@/types/user-profile.type";

export class InMemoryUserRepositoryImpl implements IUserRepository {
	private readonly _config = resolve<AppConfigInterface>(IAppConfig);
	private readonly _logger = resolve<LoggerInterface>(ILogger);

	getById(id: string): UserProfile {
		this._logger.log(`GET ${this._config.usersEndpoint}/${id}`);

		return (
			BASIC_USERS[id] ?? {
				id,
				displayName: "Unknown User",
			}
		);
	}
}
