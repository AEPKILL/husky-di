/**
 * @overview Identify the recorded endpoint's owner role in the lab topology.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Plug, Server } from "lucide-react";
import { LabSideEnum } from "@/enums/lab-recording.enum";

export function EndpointBadge({ side }: { readonly side: LabSideEnum }) {
	const connector = side === LabSideEnum.browser;
	const Icon = connector ? Plug : Server;
	return (
		<span
			className="endpoint-badge"
			data-owner={connector ? "connector" : "acceptor"}
		>
			<Icon aria-hidden="true" />
			{connector ? "Connector" : "Acceptor"}
		</span>
	);
}
