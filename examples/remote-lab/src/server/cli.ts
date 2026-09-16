/**
 * @overview Runs saved TypeScript Lab cases with the same project service and verdicts as the workbench.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { LabExecutionModeEnum } from "@/enums/platform/execution.enum";
import { PlatformRunResultEnum } from "@/enums/platform-run.enum";
import { createPlatformService } from "@/factories/platform-service.factory";
import type { PlatformProjectDescription } from "@/types/platform-project.type";
import type { PlatformRun } from "@/types/platform-run.type";

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			project: { type: "string" },
			case: { type: "string", multiple: true },
			parameters: { type: "string", default: "{}" },
			url: { type: "string" },
			output: { type: "string" },
			json: { type: "boolean", default: false },
		},
	});
	const rootPath = resolve(values.project ?? "cases");
	const parameters: unknown = JSON.parse(values.parameters);
	if (
		!parameters ||
		typeof parameters !== "object" ||
		Array.isArray(parameters)
	)
		throw new Error("--parameters must be a JSON object.");
	const service = values.url ? undefined : createPlatformService();
	const server = service
		? createServer((request, response) => {
				if (!service.handleRequest(request, response)) {
					response.statusCode = 404;
					response.end();
				}
			})
		: undefined;
	let origin = values.url;
	if (server) {
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Missing CLI control address.");
		origin = `http://127.0.0.1:${address.port}`;
	}
	const remote = async <T>(path: string, body?: unknown): Promise<T> => {
		const response = await fetch(`${origin}/api/platform${path}`, {
			...(body
				? {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					}
				: {}),
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error ?? response.statusText);
		return data;
	};
	try {
		const opened = await remote<{ id: string }>("/projects", { rootPath });
		const project = await remote<PlatformProjectDescription>(
			`/projects/${opened.id}`,
		);
		const entries =
			values.case ??
			project.files.filter((file) => file.isCase).map((file) => file.path);
		const request = {
			entries,
			parameters: parameters as Record<string, unknown>,
			mode: LabExecutionModeEnum.test,
		};
		let run = await remote<PlatformRun>(`/projects/${opened.id}/runs`, request);
		if (
			run.mode !== request.mode ||
			JSON.stringify(run.entries) !== JSON.stringify([...new Set(entries)]) ||
			JSON.stringify(run.snapshot.parameters) !== JSON.stringify(parameters)
		)
			throw new Error(
				`Project already owns a different active run (${run.id}); no requested CI case was started.`,
			);
		while (run.active) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			run = await remote<PlatformRun>(`/projects/${opened.id}/runs/${run.id}`);
		}
		const report = JSON.stringify(run, null, 2);
		if (values.output) await writeFile(resolve(values.output), `${report}\n`);
		console.log(
			values.json
				? report
				: `${run.result} · ${run.entries.length} case(s) · termination=${run.termination} · cleanup=${run.cleanup}\n${run.id}${run.error ? `\n${run.error}` : ""}`,
		);
		process.exitCode = run.result === PlatformRunResultEnum.passed ? 0 : 1;
	} finally {
		await service?.shutdown();
		server?.closeAllConnections();
		if (server)
			await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

void main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
});
