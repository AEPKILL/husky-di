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
	ResolveRecordNode,
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
