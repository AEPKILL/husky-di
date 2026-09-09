/**
 * @overview Waits for one terminal process signal and removes both handlers.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

export async function waitForShutdown(): Promise<void> {
	await new Promise<void>((resolve) => {
		const finish = () => {
			process.off("SIGINT", finish);
			process.off("SIGTERM", finish);
			resolve();
		};
		process.once("SIGINT", finish);
		process.once("SIGTERM", finish);
	});
}
