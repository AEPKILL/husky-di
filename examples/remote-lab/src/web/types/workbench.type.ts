/**
 * @overview React workbench state and interaction inputs.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import type { RpcStateStatusEnum } from "@husky-di/remote";
import type { FormEventHandler, MouseEventHandler } from "react";
import type { LabStreamExperimentSnapshot } from "@/types/lab-stream.type";
import type { DevtoolsView, RenderDevtoolsOptions } from "@/web/devtools";

export type WorkbenchProps = {
	readonly texts: Readonly<Record<string, string>>;
	readonly scenario: string;
	readonly peerId: string;
	readonly transportStatus: RpcStateStatusEnum;
	readonly unavailable: boolean;
	readonly reportBusy: boolean;
	readonly reportCancelable: boolean;
	readonly reportResumable: boolean;
	readonly capacityPending: boolean;
	readonly greetings: readonly { readonly id: number; readonly text: string }[];
	readonly stream: LabStreamExperimentSnapshot;
	readonly devtools: RenderDevtoolsOptions;
	readonly onAction: MouseEventHandler<HTMLButtonElement>;
	readonly onSubmit: FormEventHandler<HTMLFormElement>;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
	readonly onDebug: (action: string) => void;
};
