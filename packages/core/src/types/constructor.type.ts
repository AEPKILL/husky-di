/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:18:13
 */

export type Constructor<Instance, Args extends unknown[] = unknown[]> = {
	new (...args: Args): Instance;
};
