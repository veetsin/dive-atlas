import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * data/sites.json carries maintainer-only `notes` (source disagreements, caveats) that the
 * UI never shows. Strip them before Vite's JSON plugin turns the file into a module, so
 * they cost nothing in the bundle (~25 % of the site data).
 */
function stripNotes(): Plugin {
  return {
    name: 'dive-atlas:strip-notes',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\?.*$/, '').endsWith('/data/sites.json')) return null;
      const sites = JSON.parse(code) as Record<string, unknown>[];
      for (const s of sites) delete s.notes;
      return { code: JSON.stringify(sites), map: null };
    },
  };
}

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
// For a user site (<user>.github.io) or a custom domain leave it unset ("/").
export default defineConfig({
  plugins: [stripNotes(), svelte()],
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
