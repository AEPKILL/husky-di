/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:18:13
 */

// biome-ignore lint/suspicious/noExplicitAny: 这里确实需要 any
export type Constructor<Instance, Args extends any[] = any[]> = {
	new (...args: Args): Instance;
};
