import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { development, preview, production } from './security-headers.js';

/* The API lives in ../backend (FastAPI). In development, Vite forwards /api
   and /uploads to it, so the browser talks to one origin and no CORS or
   API keys are involved on the frontend. Override with DIXLAB_API. */
const api = process.env.DIXLAB_API || 'http://127.0.0.1:8000';
const proxy = {
  '/api': { target: api, changeOrigin: true },
  '/uploads': { target: api, changeOrigin: true },
};

/* `npm run build` writes the production security headers next to the built
   site, in the formats most static hosts read, so they can't be forgotten:
     dist/_headers        Netlify, Cloudflare Pages (and others using that format)
     dist/vercel.json     Vercel
     dist/headers.json    plain name -> value, to copy into any other host's settings
   Hosts that read none of these: set the values from headers.json by hand. */
function productionHeaders() {
  let outDir = 'dist';
  return {
    name: 'dixlab-production-headers',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const lines = Object.entries(production).map(([k, v]) => `  ${k}: ${v}`).join('\n');
      writeFileSync(resolve(outDir, '_headers'), `/*\n${lines}\n`);
      writeFileSync(resolve(outDir, 'vercel.json'), JSON.stringify({
        headers: [{ source: '/(.*)', headers: Object.entries(production).map(([key, value]) => ({ key, value })) }],
        rewrites: [{ source: '/((?!api/|uploads/|assets/).*)', destination: '/index.html' }],
      }, null, 2));
      writeFileSync(resolve(outDir, 'headers.json'), JSON.stringify(production, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), productionHeaders()],
  server: { port: 5173, proxy, headers: development },
  preview: { port: 4173, proxy, headers: preview },
});
