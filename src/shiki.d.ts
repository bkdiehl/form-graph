// Build-time syntax highlighting — see the shiki-raw plugin in vite.config.ts.
declare module '*?shiki' {
	const html: string;
	export default html;
}
