/**
 * @overview Routes custom-service management separately from safe diagnostic snapshots.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { LabCustomFailureEnum } from "@/enums/lab-custom-services.enum";
import type { ILabCustomServices } from "@/interfaces/lab-custom-services.interface";

export function handleLabCustomRequest(
	request: IncomingMessage,
	response: ServerResponse,
	custom: ILabCustomServices,
): boolean {
	if (!request.url?.startsWith("/api/custom")) return false;
	if (request.method === "GET" && request.url === "/api/custom") {
		response.end(JSON.stringify(custom.snapshot()));
	} else if (
		request.method === "GET" &&
		request.url.startsWith("/api/custom/operations/")
	) {
		const requestId = request.url.slice("/api/custom/operations/".length);
		try {
			const operation = custom.operation(decodeURIComponent(requestId));
			response.statusCode = operation ? 200 : 404;
			response.end(JSON.stringify(operation ?? { error: "unconfirmed" }));
		} catch {
			response.statusCode = 400;
			response.end(JSON.stringify({ error: LabCustomFailureEnum.validation }));
		}
	} else if (request.method === "POST" && request.url === "/api/custom") {
		let body = "";
		let bytes = 0;
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			bytes += Buffer.byteLength(chunk);
			if (bytes <= 1_048_576) body += chunk;
		});
		request.on("end", () => {
			if (bytes > 1_048_576) {
				response.statusCode = 413;
				response.end(
					JSON.stringify({ error: LabCustomFailureEnum.validation }),
				);
				return;
			}
			try {
				response.end(JSON.stringify(custom.execute(JSON.parse(body))));
			} catch {
				response.statusCode = 400;
				response.end(
					JSON.stringify({ error: LabCustomFailureEnum.validation }),
				);
			}
		});
		request.on("error", () => {
			if (!response.writableEnded) {
				response.statusCode = 400;
				response.end(
					JSON.stringify({ error: LabCustomFailureEnum.validation }),
				);
			}
		});
	} else {
		response.statusCode = 404;
		response.end(JSON.stringify({ error: "Not found" }));
	}
	return true;
}
