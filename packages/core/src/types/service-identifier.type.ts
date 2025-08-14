/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:17:41
 */

import type { Constructor } from "@/types/constructor.type";
import type { AbstractConstructor } from "./abstract-constructor.type";

export type ServiceIdentifier<T> =
	| AbstractConstructor<T>
	| Constructor<T>
	| string
	| symbol;

export type ServiceIdentifierInstance<R extends ServiceIdentifier<unknown>> =
	R extends ServiceIdentifier<infer T> ? T : unknown;
