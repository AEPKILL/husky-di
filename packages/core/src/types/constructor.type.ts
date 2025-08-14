/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:18:13
 */

// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
export type Constructor<Instance, Args extends any[] = any[]> = new (
	...args: Args
) => Instance;
