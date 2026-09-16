/**
 * @overview Lab-owned custom definitions, retained facades and bounded caller observations.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import type {
	LabCustomActionEnum,
	LabCustomBehaviorEnum,
	LabCustomFailureEnum,
	LabCustomScopeEnum,
} from "@/enums/lab-custom-services.enum";

export type LabCustomTarget = {
	readonly scope: LabCustomScopeEnum;
	readonly instanceId: string;
	readonly peerId?: string;
};

export type LabCustomMethod = {
	readonly name: string;
	readonly behavior: LabCustomBehaviorEnum;
	readonly valueJson: string;
	readonly delayMs: number;
	readonly cancelable: boolean;
};

export type LabCustomDefinitionInput = {
	readonly target: LabCustomTarget;
	readonly wireName: string;
	readonly methods: readonly LabCustomMethod[];
};

export type LabCustomDefinition = LabCustomDefinitionInput & {
	readonly id: string;
	readonly revision: number;
	readonly exposed: boolean;
	readonly targetValid: boolean;
};

export type LabCustomFacadeInput = {
	readonly target: LabCustomTarget;
	readonly wireName: string;
	readonly methods: readonly Pick<LabCustomMethod, "name" | "cancelable">[];
};

export type LabCustomFacade = LabCustomFacadeInput & {
	readonly id: string;
	readonly targetValid: boolean;
};

export type LabCustomCall = {
	readonly id: string;
	readonly traceId: string;
	readonly facadeId: string;
	readonly target: LabCustomTarget;
	readonly wireName: string;
	readonly method: string;
	readonly cancelable: boolean;
	readonly startedAt: number;
	readonly elapsedMs: number;
	readonly outcome: string;
	readonly result?: string;
};

export type LabCustomCatalog = {
	readonly target: LabCustomTarget;
	readonly definitions: readonly (Omit<LabCustomFacadeInput, "target"> & {
		readonly id: string;
		readonly revision: number;
		readonly exposed: boolean;
	})[];
};

export type LabCustomSnapshot = {
	readonly instanceId: string;
	readonly observation: number;
	readonly observedAt: number;
	readonly revision: number;
	readonly definitions: readonly LabCustomDefinition[];
	readonly facades: readonly LabCustomFacade[];
	readonly calls: readonly LabCustomCall[];
	readonly catalogs: readonly LabCustomCatalog[];
};

export type LabCustomCommand = {
	readonly instanceId: string;
	readonly requestId: string;
} & (
	| {
			readonly action: LabCustomActionEnum.save;
			readonly definition: LabCustomDefinitionInput;
			readonly id?: string;
			readonly revision?: number;
	  }
	| {
			readonly action:
				| LabCustomActionEnum.expose
				| LabCustomActionEnum.revoke
				| LabCustomActionEnum.remove;
			readonly id: string;
			readonly revision: number;
	  }
	| {
			readonly action: LabCustomActionEnum.reset;
			readonly target: LabCustomTarget;
			readonly revision: number;
	  }
	| {
			readonly action: LabCustomActionEnum.resolve;
			readonly facade: LabCustomFacadeInput;
	  }
	| {
			readonly action: LabCustomActionEnum.call;
			readonly facadeId: string;
			readonly method: string;
			readonly argsJson: string;
	  }
	| { readonly action: LabCustomActionEnum.cancel; readonly callId: string }
	| {
			readonly action: LabCustomActionEnum.advertise;
			readonly catalog: LabCustomCatalog;
	  }
);

export type LabCustomCommandResult = {
	readonly requestId: string;
	readonly ok: boolean;
	readonly error?: LabCustomFailureEnum;
	readonly id?: string;
	readonly snapshot: LabCustomSnapshot;
};
