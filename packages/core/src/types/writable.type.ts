/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-23 19:55:00
 */

export type Writable<T> = {
	-readonly [P in keyof T]: T[P];
};
