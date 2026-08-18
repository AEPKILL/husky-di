/**
 * Resolve option validation utilities.
 *
 * @overview
 * Applies the shared runtime constraints for container and helper resolution
 * entry points.
 *
 * @author AEPKILL
 * @created 2026-08-18 22:38:00
 */

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { ResolveException } from "@/exceptions/resolve.exception";
import type { ResolveOptions } from "@/interfaces/container.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { getServiceIdentifierName } from "@/utils/service-identifier.util";

/**
 * Validates a set of resolve options.
 *
 * @param serviceIdentifier - The service identifier being resolved
 * @param resolveOptions - The options to validate
 * @param resolveRecord - The active resolution record used for error context
 */
export function assertValidResolveOptions<T>(
	serviceIdentifier: ServiceIdentifier<T>,
	resolveOptions: ResolveOptions<T>,
	resolveRecord: IInternalResolveRecord,
): void {
	const { defaultValue, dynamic, ref, multiple, optional } = resolveOptions;
	const identifierName = getServiceIdentifierName(serviceIdentifier);
	const hasDefaultValue = defaultValue !== undefined;

	if (dynamic && ref) {
		throw new ResolveException(
			CoreErrorCodeEnum.E_INVALID_OPTIONS,
			`Cannot use both "dynamic" and "ref" options simultaneously for service identifier "${identifierName}". These options are mutually exclusive. Please choose either "dynamic" or "ref", but not both.`,
			resolveRecord,
		);
	}

	if (hasDefaultValue && optional !== true) {
		throw new ResolveException(
			CoreErrorCodeEnum.E_INVALID_OPTIONS,
			`Cannot specify "defaultValue" without setting "optional" to true for service identifier "${identifierName}".`,
			resolveRecord,
		);
	}

	if (hasDefaultValue && multiple && !Array.isArray(defaultValue)) {
		throw new ResolveException(
			CoreErrorCodeEnum.E_INVALID_OPTIONS,
			`When "multiple" is true, "defaultValue" must be an array for service identifier "${identifierName}".`,
			resolveRecord,
		);
	}
}
