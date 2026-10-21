import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const SITES_JSON = fileURLToPath(new URL('./data/sites.json', import.meta.url));
/** Fields only the open site card needs (plus maintainer notes, which the UI never shows). */
const DETAIL_FIELDS = ['summary', 'highlights', 'sources', 'notes'] as const;

/**
 * data/sites.json stays one hand-edited file, but ships as two modules:
 *  - the static import of `data/sites.json` gets the light fields (map, search, footprint);
 *  - `virtual:site-details` (summary / highlights / sources, keyed by id) is a separate chunk
 *    that SiteCard pulls in on first open. Notes never ship.
 * With 200 sites this keeps the main bundle ~50 KB gzip lighter (SPEC §7.1).
 */
function siteData(): Plugin {
  const VIRTUAL = 'virtual:site-details';
  const RESOLVED = '\0' + VIRTUAL;
  return {
    name: 'dive-atlas:site-data',
    enforce: 'pre',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      this.addWatchFile(SITES_JSON);
      const sites = JSON.parse(readFileSync(SITES_JSON, 'utf8')) as Record<string, unknown>[];
      const details = Object.fromEntries(
        sites.map((s) => [s.id, { summary: s.summary, highlights: s.highlights ?? [], sources: s.sources ?? [] }]),
      );
      return `export default ${JSON.stringify(details)};`;
    },
    transform(code, id) {
      if (!id.replace(/\?.*$/, '').endsWith('/data/sites.json')) return null;
      const sites = JSON.parse(code) as Record<string, unknown>[];
      for (const s of sites) for (const f of DETAIL_FIELDS) delete s[f];
      return { code: JSON.stringify(sites), map: null };
    },
  };
}

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
// For a user site (<user>.github.io) or a custom domain leave it unset ("/").
export default defineConfig({
  plugins: [siteData(), svelte()],
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2020',
    // Single chunk today; the preload polyfill would be dead weight.
    modulePreload: { polyfill: false },
    // Never inline assets as data: URIs — keeps the JS bundle small and sprites cacheable.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
