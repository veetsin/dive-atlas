import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
// For a user site (<user>.github.io) or a custom domain leave it unset ("/").
export default defineConfig({
  plugins: [svelte()],
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2020',
    // Never inline assets as data: URIs — keeps the JS bundle small and sprites cacheable.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
