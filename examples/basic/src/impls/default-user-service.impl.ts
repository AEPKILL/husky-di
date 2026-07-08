/**
 * Default user service implementation for the basic example.
 *
 * @overview
 * Composes the repository and logger services to produce a simple summary result.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { resolve } from "@husky-di/core";
import {
	IAppLogger,
	type ILogger as LoggerInterface,
} from "@/interfaces/logger.interface";
import {
	IUserRepository,
	type IUserRepository as UserRepositoryInterface,
} from "@/interfaces/user-repository.interface";
import type { IUserService } from "@/interfaces/user-service.interface";

export class DefaultUserServiceImpl implements IUserService {
	private readonly _logger = resolve<LoggerInterface>(IAppLogger);
	private readonly _userRepository =
		resolve<UserRepositoryInterface>(IUserRepository);

	getUserSummary(id: string): string {
		const user = this._userRepository.getById(id);

		this._logger.log(`Loaded profile for ${user.displayName}`);

		return `${user.id}: ${user.displayName}`;
	}
}
