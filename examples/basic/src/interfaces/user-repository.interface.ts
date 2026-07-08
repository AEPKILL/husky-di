/**
 * User repository interface for the basic example.
 *
 * @overview
 * Defines the read-side contract for retrieving user profiles in the example.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { UserProfile } from "@/types/user-profile.type";

export interface IUserRepository {
	getById(id: string): UserProfile;
}

export const IUserRepository =
	createServiceIdentifier<IUserRepository>("IUserRepository");
