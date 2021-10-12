/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 18:49:32
 */

export function metadataKeyExtractor(metadata: HuskyDi.InjectionMetadata<any>) {
  const { ref = false, multiple = false } = metadata;

  return [ref ? 1 : 0, multiple ? 1 : 0].join('-');
}
