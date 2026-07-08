/**
 * In-memory user records for the basic example.
 *
 * @overview
 * Provides a tiny static dataset used by the repository implementation.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

import type { UserProfile } from "@/types/user-profile.type";

export const BASIC_USERS: Record<string, UserProfile> = {
	"u-1": {
		id: "u-1",
		displayName: "Ada Lovelace",
	},
	"u-2": {
		id: "u-2",
		displayName: "Grace Hopper",
	},
};
