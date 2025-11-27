/**
 * Utility functions for working with resolve records.
 *
 * @overview
 * Provides helper functions for managing resolution records, including
 * getting, setting, and manipulating resolve record data. These utilities
 * are used for tracking resolution paths, detecting circular dependencies,
 * and generating error messages.
 *
 * @author AEPKILL
 * @created 2025-07-30 00:25:55
 */

import { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import { ResolveRecord } from "@/impls/ResolveRecord";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	IInternalResolveRecord,
	MessageResolveRecordData,
	ResolveRecordData,
	RootResolveRecordData,
	ServiceIdentifierResolveRecordData,
} from "@/interfaces/resolve-record.interface";
import { resolveRecordRef } from "@/shared/instances";
import { getServiceIdentifierName } from "./service-identifier.utils";

/**
 * Gets the current resolution record.
 *
 * @returns The current resolution record, or undefined if no resolution is in progress
 */
export function getResolveRecord(): IInternalResolveRecord | undefined {
	return resolveRecordRef.current;
}

/**
 * Gets the current resolution record, creating one if it doesn't exist.
 *
 * @param container - The container to use for creating a new resolution record if needed
 * @returns The current or newly created resolution record
 */
export function getEnsureResolveRecord(
	container: IContainer,
): IInternalResolveRecord {
	if (!resolveRecordRef.current) {
		resolveRecordRef.current = new ResolveRecord(container);
	}
	return resolveRecordRef.current;
}

/**
 * Resets the current resolution record.
 *
 * @remarks
 * Clears the resolution record reference, typically called after
 * a resolution completes or fails.
 */
export function resetResolveRecord(): void {
	resolveRecordRef.current = undefined;
}

/**
 * Sets the current resolution record.
 *
 * @param resolveRecord - The resolution record to set as current
 */
export function setResolveRecord(resolveRecord: IInternalResolveRecord): void {
	resolveRecordRef.current = resolveRecord;
}

/**
 * Gets a human-readable name for a service identifier resolve record.
 *
 * @typeParam T - The service type
 * @param resolveIdentifierRecord - The service identifier resolve record
 * @returns A formatted string representing the resolve record with all options
 */
export function getResolveIdentifierRecordName<T>(
	resolveIdentifierRecord: ServiceIdentifierResolveRecordData<T>,
): string {
	const names = [];
	const serviceIdentifierName = getServiceIdentifierName(
		resolveIdentifierRecord.serviceIdentifier,
	);

	names.push(`#${resolveIdentifierRecord.container.displayName}`);

	const { ref, dynamic, optional, multiple, defaultValue } =
		resolveIdentifierRecord.resolveOptions || {};

	if (ref === true) {
		names.push("Ref");
	}

	if (dynamic === true) {
		names.push("Dynamic");
	}

	if (optional === true) {
		names.push("Optional");
	}

	if (multiple === true) {
		names.push("Multiple");
	}

	if (defaultValue !== void 0) {
		names.push("DefaultValue");
	}

	return `${serviceIdentifierName}[${names.join(",")}]`;
}

/**
 * Type guard to check if a resolve record is a service identifier record.
 *
 * @typeParam T - The service type
 * @param resolveRecord - The resolve record to check
 * @returns True if the record is a service identifier record
 */
export function isResolveServiceIdentifierRecord<T>(
	resolveRecord: ResolveRecordData<T>,
): resolveRecord is ServiceIdentifierResolveRecordData<T> {
	return resolveRecord.type === ResolveRecordTypeEnum.serviceIdentifier;
}

/**
 * Type guard to check if a resolve record is a root record.
 *
 * @param resolveRecord - The resolve record to check
 * @returns True if the record is a root record
 */
export function isResolveRootRecord(
	resolveRecord: ResolveRecordData<unknown>,
): resolveRecord is RootResolveRecordData {
	return resolveRecord.type === ResolveRecordTypeEnum.root;
}

/**
 * Type guard to check if a resolve record is a message record.
 *
 * @param resolveRecord - The resolve record to check
 * @returns True if the record is a message record
 */
export function isResolveMessageRecord(
	resolveRecord: ResolveRecordData<unknown>,
): resolveRecord is MessageResolveRecordData {
	return resolveRecord.type === ResolveRecordTypeEnum.message;
}

/**
 * Checks if two service identifier resolve records are equal.
 *
 * @remarks
 * Used for detecting circular dependencies during resolution. Two records
 * are considered equal if they resolve the same service identifier from the
 * same container, and neither uses ref or dynamic options (which break
 * circular dependency cycles). The optional flag is not considered because
 * it doesn't affect the resolution process when the service is registered.
 *
 * @param aResolveRecord - The first resolve record to compare
 * @param bResolveRecord - The second resolve record to compare
 * @returns True if the records represent the same resolution, false otherwise
 */
export function isEqualServiceIdentifierResolveRecord(
	aResolveRecord: ResolveRecordData<unknown>,
	bResolveRecord: ResolveRecordData<unknown>,
): boolean {
	const bothIsResolveIdentifierRecord =
		isResolveServiceIdentifierRecord(aResolveRecord) &&
		isResolveServiceIdentifierRecord(bResolveRecord);

	if (!bothIsResolveIdentifierRecord) {
		return false;
	}

	const containerIsEqual =
		aResolveRecord.container === bResolveRecord.container;
	const serviceIdentifierIsEqual =
		aResolveRecord.serviceIdentifier === bResolveRecord.serviceIdentifier;

	// This method is used to determine circular references. When ref or dynamic
	// is added, there will be no circular references, so when one of these two
	// flags is true, it is considered that the two resolve records are not equal.
	// Don't care about optional flag, because optional flag doesn't affect
	// resolve process when service identifier is registered.
	const isNotRef =
		!aResolveRecord.resolveOptions?.ref && !bResolveRecord.resolveOptions?.ref;
	const isNotDynamic =
		!aResolveRecord.resolveOptions?.dynamic &&
		!bResolveRecord.resolveOptions?.dynamic;

	return (
		containerIsEqual && serviceIdentifierIsEqual && isNotRef && isNotDynamic
	);
}

/**
 * Gets a human-readable name for a resolve record.
 *
 * @param resolveRecord - The resolve record to get the name for
 * @returns A string representation of the resolve record
 */
export function getResolveRecordName(
	resolveRecord: ResolveRecordData<unknown>,
) {
	if (isResolveRootRecord(resolveRecord)) {
		return "Start Resolve";
	}

	if (isResolveMessageRecord(resolveRecord)) {
		return resolveRecord.message;
	}

	if (isResolveServiceIdentifierRecord(resolveRecord)) {
		return getResolveIdentifierRecordName(resolveRecord);
	}

	return "";
}

/** Separator used when joining resolve paths in error messages. */
const ResolvePathSeparator = " -> ";

/**
 * Options for generating resolve record error messages.
 */
export interface GetResolveRecordMessageOptions {
	/** The main error message */
	message: string;
	/** The resolution path records */
	paths: Array<ResolveRecordData<unknown>>;
	/** Optional cycle node if a circular dependency was detected */
	cycleNode?: ResolveRecordData<unknown>;
}

/**
 * Generates a formatted error message from resolve record data.
 *
 * @param options - The options for generating the message
 * @returns A formatted error message string with resolution path and cycle information
 */
export function getResolveRecordMessage(
	options: GetResolveRecordMessageOptions,
): string {
	const { message, paths, cycleNode } = options;

	const resolvePaths: Array<ServiceIdentifierResolveRecordData<unknown>> = [];
	const resolveDetails: Array<ResolveRecordData<unknown>> = [];

	for (const it of paths) {
		if (isResolveServiceIdentifierRecord(it)) {
			resolvePaths.push(it);
		}
		resolveDetails.push(it);
	}

	return [
		message,
		resolvePaths
			.map((it) => {
				const name = getResolveIdentifierRecordName(it);
				const isCycle =
					cycleNode && isEqualServiceIdentifierResolveRecord(it, cycleNode);
				if (isCycle) {
					return `((${name}))`;
				}
				return name;
			})
			.join(ResolvePathSeparator),
		...indent(
			resolveDetails.map((it) =>
				isResolveServiceIdentifierRecord(it)
					? `Resolve ${getResolveRecordName(it)}	`
					: `${getResolveRecordName(it)}`,
			),
		),
	].join("\n");
}

/** Whitespace used for indenting nested messages. */
const IndentWhitespace = "  ";

/**
 * Indents an array of messages, with each message indented by its index.
 *
 * @param messages - The messages to indent
 * @returns An array of indented messages
 */
function indent(messages: string[]): string[] {
	return messages.map(
		(message, index) => `${IndentWhitespace.repeat(index)}${message}`,
	);
}
