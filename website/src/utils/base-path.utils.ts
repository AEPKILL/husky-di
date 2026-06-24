/**
 * Website base path helpers.
 *
 * @overview
 * Normalizes the public base path used by both Vite asset URLs and TanStack
 * Router navigation when the documentation app is served from a subdirectory
 * such as a GitHub Pages project site.
 *
 * @author AEPKILL
 * @created 2026-06-25 17:10:00
 */

export function getNormalizedWebsiteBasePath(rawBasePath: string): string {
	if (!rawBasePath || rawBasePath === "/") {
		return "/";
	}

	const trimmedBasePath = rawBasePath.trim();

	if (trimmedBasePath === "" || trimmedBasePath === "/") {
		return "/";
	}

	const basePathWithoutTrailingSlash = trimmedBasePath.endsWith("/")
		? trimmedBasePath.slice(0, -1)
		: trimmedBasePath;

	return basePathWithoutTrailingSlash.startsWith("/")
		? basePathWithoutTrailingSlash
		: `/${basePathWithoutTrailingSlash}`;
}
