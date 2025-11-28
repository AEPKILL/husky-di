/**
 * @overview
 * Metadata key constants used for storing and retrieving dependency injection metadata
 * @author AEPKILL
 * @created 2021-10-03 20:55:17
 */

/**
 * TypeScript's built-in metadata key for constructor parameter types.
 *
 * @see {@link https://www.typescriptlang.org/tsconfig/#Language_and_Environment_6254}
 */
export const ParamsMetadataKeyConst = "design:paramtypes";

/**
 * Custom metadata key for storing injection metadata of a class.
 * Contains information about how each constructor parameter should be resolved,
 * including service identifiers and injection options.
 *
 * @remarks
 * Stores: `Array<InjectionMetadata<T> | undefined>`
 *
 */
export const InjectionMetadataKeyConst = "husky-di.injection-metadata";
