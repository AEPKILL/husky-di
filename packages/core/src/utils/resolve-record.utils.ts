/**
 * @overview
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

export function getResolveRecord(): IInternalResolveRecord | undefined {
	return resolveRecordRef.current;
}

export function getEnsureResolveRecord(
	container: IContainer,
): IInternalResolveRecord {
	if (!resolveRecordRef.current) {
		resolveRecordRef.current = new ResolveRecord(container);
	}
	return resolveRecordRef.current;
}

export function resetResolveRecord(): void {
	resolveRecordRef.current = undefined;
}

export function setResolveRecord(resolveRecord: IInternalResolveRecord): void {
	resolveRecordRef.current = resolveRecord;
}

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

export function isResolveServiceIdentifierRecord<T>(
	resolveRecord: ResolveRecordData<T>,
): resolveRecord is ServiceIdentifierResolveRecordData<T> {
	return resolveRecord.type === ResolveRecordTypeEnum.serviceIdentifier;
}

export function isResolveRootRecord(
	resolveRecord: ResolveRecordData<unknown>,
): resolveRecord is RootResolveRecordData {
	return resolveRecord.type === ResolveRecordTypeEnum.root;
}

export function isResolveMessageRecord(
	resolveRecord: ResolveRecordData<unknown>,
): resolveRecord is MessageResolveRecordData {
	return resolveRecord.type === ResolveRecordTypeEnum.message;
}

// check two resolve record is equal, for check cycle reference
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

	// this method is used to determine circular references, when ref or dynamic is added, there will be no circular references
	// so when one of these two flags is true, it is considered that the two resolve records are not equal
	// don't case about optional flag, because optional flag not affect resolve process when service identifier is registered
	const isNotRef =
		!aResolveRecord.resolveOptions?.ref && !bResolveRecord.resolveOptions?.ref;
	const isNotDynamic =
		!aResolveRecord.resolveOptions?.dynamic &&
		!bResolveRecord.resolveOptions?.dynamic;

	return (
		containerIsEqual && serviceIdentifierIsEqual && isNotRef && isNotDynamic
	);
}

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

const ResolvePathSeparator = " -> ";
export interface GetResolveRecordMessageOptions {
	message: string;
	paths: Array<ResolveRecordData<unknown>>;
	cycleNode?: ResolveRecordData<unknown>;
}
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

const IndentWhitespace = "  ";
function indent(messages: string[]): string[] {
	return messages.map(
		(message, index) => `${IndentWhitespace.repeat(index)}${message}`,
	);
}
