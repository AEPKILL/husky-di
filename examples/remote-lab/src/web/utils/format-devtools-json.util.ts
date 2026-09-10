/**
 * @overview Formats detached JSON previews without revisiting application values.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export function formatDevtoolsJson(preview: string): string {
	try {
		return JSON.stringify(JSON.parse(preview), null, 2) ?? preview;
	} catch {
		return preview;
	}
}
