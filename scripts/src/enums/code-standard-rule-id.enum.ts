/**
 * Code standard rule IDs.
 *
 * @overview
 * Defines all rule identifiers for the repository code standard validator.
 * Used to ensure consistency across validators and prevent typos.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:36:00
 */

export enum CodeStandardRuleIdEnum {
	HeadersRequiredMetadata = "headers/required-metadata",
	NamingFileName = "naming/file-name",
	NamingEnumName = "naming/enum-name",
	NamingConstantName = "naming/constant-name",
	NamingInterfaceFileName = "naming/interface-file-name",
	NamingInterfaceName = "naming/interface-name",
	PlacementSourceDirectory = "placement/source-directory",
	PlacementSourceDirectorySuffix = "placement/source-directory-suffix",
	ExportsNoDefaultExport = "exports/no-default-export",
	EntrypointExportOnly = "entrypoint/export-only",
	ImportsNoInternalPackagePath = "imports/no-internal-package-path",
	CommentsBiomeIgnoreReason = "comments/biome-ignore-reason",
	TypeFileExportsOnly = "type-file/exports-only",
}
