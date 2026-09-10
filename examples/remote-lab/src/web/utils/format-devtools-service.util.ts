/**
 * @overview Shortens example service names consistently across DevTools panels.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export function formatDevtoolsService(service: string): string {
	return service.replace(/^example\./, "").replace(/\.v1$/, "");
}
