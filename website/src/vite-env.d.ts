/// <reference types="vite/client" />
/// <reference types="mdx" />

declare module "*.css?url" {
	const url: string;
	export default url;
}
