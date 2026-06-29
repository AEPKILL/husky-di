/**
 * Import scope factory.
 *
 * @overview
 * Creates the normalized import visibility model for module imports.
 *
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type {
	Alias,
	IModule,
	ModuleWithAliases,
} from "@/interfaces/module.interface";
import type { ImportScope } from "@/types/import-scope.type";
import { isModuleWithAliases } from "@/utils/module-import.util";

export function createImportScope(
	imports?: ReadonlyArray<IModule | ModuleWithAliases>,
): ImportScope {
	const bindings = (imports ?? []).flatMap((item) => {
		const sourceModule = isModuleWithAliases(item) ? item.module : item;
		const aliases = isModuleWithAliases(item) ? (item.aliases ?? []) : [];
		const aliasMap = createAliasMap(aliases);

		return (sourceModule.exports ?? []).map((sourceServiceIdentifier) => {
			const localServiceIdentifier =
				aliasMap.get(sourceServiceIdentifier) ?? sourceServiceIdentifier;

			return {
				sourceModule,
				sourceServiceIdentifier,
				localServiceIdentifier,
				isAliased: aliasMap.has(sourceServiceIdentifier),
			};
		});
	});

	return {
		bindings,
		visibleServiceIdentifiers: new Set(
			bindings.map((binding) => binding.localServiceIdentifier),
		),
	};
}

function createAliasMap(
	aliases: ReadonlyArray<Alias>,
): Map<ServiceIdentifier<unknown>, ServiceIdentifier<unknown>> {
	return new Map(aliases.map((alias) => [alias.serviceIdentifier, alias.as]));
}
