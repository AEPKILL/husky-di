/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 18:49:32
 */

export function metadataKeyExtractor(metadata: HuskyDi.InjectionMetadata<any>) {
  const { ref = false, multiple = false, dynamic = false } = metadata;

  return [ref, multiple, dynamic].map(it => (it ? 1 : 0)).join('-');
}
