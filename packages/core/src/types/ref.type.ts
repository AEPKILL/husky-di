/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 11:28:03
 */

export type Ref<T> = {
	readonly current: T;
	readonly resolved: boolean;
};

export type MutableRef<T> = {
	current?: T;
};
