import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { codeToHtml } from 'shiki';

// `import html from './x.ts?shiki'` → the file highlighted to HTML at build
// time. The demo pages display their own source without shipping any
// highlighting JS to the browser.
function shikiRaw(): Plugin {
	// The virtual id keeps the real extension out of the module id, so the
	// svelte/ts plugins never try to compile the highlighted HTML.
	const PREFIX = '\0shiki:';
	// Extension-based plugin filters (svelte, ts) match on the id's extname
	// even through the \0 prefix, so the virtual id must not keep the real one.
	const SUFFIX = '.shiki-html';
	return {
		name: 'shiki-raw',
		enforce: 'pre',
		async resolveId(source, importer) {
			const [path, query] = source.split('?', 2);
			if (query !== 'shiki') return;
			const resolved = await this.resolve(path, importer, { skipSelf: true });
			if (!resolved) return;
			return PREFIX + resolved.id + SUFFIX;
		},
		async load(id) {
			if (!id.startsWith(PREFIX) || !id.endsWith(SUFFIX)) return;
			const path = id.slice(PREFIX.length, -SUFFIX.length);
			this.addWatchFile(path);
			const code = (await readFile(path, 'utf8')).trimEnd();
			const lang = path.endsWith('.svelte') ? 'svelte' : 'typescript';
			const html = await codeToHtml(code, { lang, theme: 'github-dark-default' });
			return `export default ${JSON.stringify(html)};`;
		}
	};
}

export default defineConfig({
	plugins: [
		shikiRaw(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Fully static: the site has no server dependency (the one former form
			// action now runs the same parse() client-side), so it deploys to
			// GitHub Pages. BASE_PATH=/form-graph is set by the deploy workflow.
			adapter: adapter(),
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	]
});
