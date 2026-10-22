import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const SITES_JSON = fileURLToPath(new URL('./data/sites.json', import.meta.url));
const SPECIES_JSON = fileURLToPath(new URL('./data/species.json', import.meta.url));
/** Fields only the open site card needs (plus maintainer notes, which the UI never shows), per file. */
const DETAIL_FIELDS = new Map([
  ['sites.json', ['summary', 'highlights', 'sources', 'notes']],
  ['species.json', ['blurb']],
]);

/**
 * data/sites.json and data/species.json stay hand-edited files, but each ships in two parts:
 *  - their static imports get the light fields (map, search, footprint);
 *  - `virtual:site-details` = { sites: summary / highlights / sources by site id,
 *    speciesBlurbs: blurb by species id } is a separate chunk that SiteCard pulls in on
 *    first open. Notes never ship.
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
      this.addWatchFile(SPECIES_JSON);
      const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>[];
      const sites = Object.fromEntries(
        read(SITES_JSON).map((s) => [s.id, { summary: s.summary, highlights: s.highlights ?? [], sources: s.sources ?? [] }]),
      );
      const speciesBlurbs = Object.fromEntries(read(SPECIES_JSON).map((s) => [s.id, s.blurb]));
      return `export default ${JSON.stringify({ sites, speciesBlurbs })};`;
    },
    transform(code, id) {
      const fields = DETAIL_FIELDS.get(id.replace(/\?.*$/, '').match(/\/data\/([^/]+)$/)?.[1] ?? '');
      if (!fields) return null;
      const rows = JSON.parse(code) as Record<string, unknown>[];
      for (const r of rows) for (const f of fields) delete r[f];
      return { code: JSON.stringify(rows), map: null };
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
