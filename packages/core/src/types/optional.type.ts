/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 00:36:55
 */

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
