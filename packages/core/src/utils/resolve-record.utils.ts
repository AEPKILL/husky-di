/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 00:25:55
 */

import { ResolveIdentifierRecordTypeEnum } from "@/enums/resolve-identifier-record-type.enum";
import { ResolveRecord } from "@/impls/ResolveRecord";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	IInternalResolveRecord,
	MessageResolveRecordNode,
	ResolveRecordNode,
	ResolveRecordTreeNode,
	RootResolveRecordNode,
	ServiceIdentifierResolveRecordNode,
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
	resolveIdentifierRecord: ServiceIdentifierResolveRecordNode<T>,
): string {
	const names = [];
	const serviceIdentifierName = getServiceIdentifierName(
		resolveIdentifierRecord.serviceIdentifier,
	);

	names.push(`#${resolveIdentifierRecord.container.name}`);

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
	resolveRecord: ResolveRecordNode<T>,
): resolveRecord is ServiceIdentifierResolveRecordNode<T> {
	return (
		resolveRecord.type === ResolveIdentifierRecordTypeEnum.serviceIdentifier
	);
}

export function isResolveRootRecord(
	resolveRecord: ResolveRecordNode<unknown>,
): resolveRecord is RootResolveRecordNode {
	return resolveRecord.type === ResolveIdentifierRecordTypeEnum.root;
}

export function isResolveMessageRecord(
	resolveRecord: ResolveRecordNode<unknown>,
): resolveRecord is MessageResolveRecordNode {
	return resolveRecord.type === ResolveIdentifierRecordTypeEnum.message;
}

// check two resolve record is equal, for check cycle reference
export function isEqualServiceIdentifierResolveRecord(
	aResolveRecord: ResolveRecordNode<unknown>,
	bResolveRecord: ResolveRecordNode<unknown>,
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
	resolveRecord: ResolveRecordNode<unknown>,
) {
	if (isResolveRootRecord(resolveRecord)) {
		return "Start Resolve";
	}

	if (isResolveMessageRecord(resolveRecord)) {
		return resolveRecord.message;
	}

	if (isResolveServiceIdentifierRecord(resolveRecord)) {
		return getServiceIdentifierName(resolveRecord.serviceIdentifier);
	}

	return "";
}

const ResolvePathSeparator = " --> ";
export interface GetResolveRecordMessageOptions {
	message: string;
	paths: Array<ResolveRecordNode<unknown>>;
	cycleNode?: ResolveRecordNode<unknown>;
}
export function getResolveRecordMessage(
	options: GetResolveRecordMessageOptions,
): string {
	const { message, paths, cycleNode } = options;

	const resolvePaths: Array<ServiceIdentifierResolveRecordNode<unknown>> = [];
	const resolveDetails: Array<ResolveRecordNode<unknown>> = [];

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
		...indent(resolveDetails.map(getResolveRecordName)),
	].join("\n");
}

const IndentWhitespace = "  ";
function indent(messages: string[]): string[] {
	return messages.map(
		(message, index) => `${IndentWhitespace.repeat(index)}${message}`,
	);
}
