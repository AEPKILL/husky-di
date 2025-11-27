/**
 * Constructor type definition.
 *
 * @overview
 * Represents a class constructor function that can be instantiated.
 * Used for type-safe service identification and instantiation.
 *
 * @typeParam Instance - The type of instance created by the constructor
 * @typeParam Args - The tuple type of constructor arguments (defaults to any[])
 *
 * @author AEPKILL
 * @created 2021-10-02 09:18:13
 */

// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
export type Constructor<Instance, Args extends any[] = any[]> = new (
	...args: Args
) => Instance;
