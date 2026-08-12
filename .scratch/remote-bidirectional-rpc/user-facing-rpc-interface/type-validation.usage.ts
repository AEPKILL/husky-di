/**
 * @overview PROTOTYPE ONLY — compile-time remote-method validation usage.
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import { ISession } from "./fixtures";
import type { ServiceIdentifier } from "./public-interface";
import {
	ContractCentered,
	FunctionalSeams,
	RootCentered,
} from "./public-interface";

interface SpecialSignal extends AbortSignal {
	readonly special: true;
}

interface InvalidSpecialSignalService {
	run(signal: SpecialSignal): void;
}

/**
 * `cancelable` is handler injection metadata: true means the implementation
 * has one required trailing AbortSignal, while the proxy makes it optional.
 * This function is a compile-only probe and must never be invoked.
 */
export function typeValidationUsage(): void {
	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: { ping: true },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: { ping: { type: "unary", cancelable: false } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error only `true` supplies unary/noncancelable defaults.
		methods: { ping: { type: "unary" } },
	});

	// @ts-expect-error methods must be an explicit per-method allowlist.
	RootCentered.createRemoteServiceIdentifier(ISession, { methods: true });

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error version is not callable.
		methods: { version: true },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error ping has no required trailing AbortSignal.
		methods: { ping: { type: "unary", cancelable: true } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error login's AbortSignal must not become a wire argument.
		methods: { login: true },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error streaming kinds are not defined in this phase.
		methods: { ping: { type: "server-streaming" } },
	});

	RootCentered.createRemoteServiceIdentifier(ISession, {
		methods: {
			// @ts-expect-error method definitions reject unknown properties.
			ping: { type: "unary", timeout: 1_000 },
		},
	});

	ContractCentered.createRemoteContract(ISession, {
		methods: {
			// @ts-expect-error every draft shares exact method validation.
			ping: { type: "unary", cancelable: false, timeout: 1_000 },
		},
	});

	FunctionalSeams.createRemoteServiceIdentifier(ISession, {
		// @ts-expect-error every draft rejects non-callable keys.
		methods: { version: true },
	});

	const invalidSpecialSignal =
		"invalid-special-signal" as ServiceIdentifier<InvalidSpecialSignalService>;
	RootCentered.createRemoteServiceIdentifier(invalidSpecialSignal, {
		// @ts-expect-error cancellation injection requires exactly AbortSignal.
		methods: { run: { type: "unary", cancelable: true } },
	});
}
