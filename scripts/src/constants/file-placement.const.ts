/**
 * File placement validator constants.
 *
 * @overview
 * Defines allowed source directory names and required file suffixes
 * for the repository code standard validator.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:27:40
 */

export const ALLOWED_SOURCE_DIRECTORY_NAMES = new Set([
	"constants",
	"consts",
	"decorators",
	"enums",
	"exceptions",
	"factories",
	"impls",
	"interfaces",
	"middlewares",
	"shared",
	"types",
	"typings",
	"utils",
]);

export const REQUIRED_SUFFIX_BY_SOURCE_DIRECTORY = new Map<string, string>([
	["constants", ".const.ts"],
	["consts", ".const.ts"],
	["decorators", ".decorator.ts"],
	["enums", ".enum.ts"],
	["exceptions", ".exception.ts"],
	["factories", ".factory.ts"],
	["interfaces", ".interface.ts"],
	["middlewares", ".middleware.ts"],
	["types", ".type.ts"],
	["typings", ".d.ts"],
	["utils", ".utils.ts"],
]);
