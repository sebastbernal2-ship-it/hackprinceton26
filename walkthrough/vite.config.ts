import { defineConfig } from 'vite';

// base './' so the built dist can be served from any path; the scene and findings URLs come from the query string.
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 4000 } });
