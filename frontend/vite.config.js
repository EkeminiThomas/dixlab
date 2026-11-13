import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* The API lives in ../backend (FastAPI). In development, Vite forwards /api
   and /uploads to it, so the browser talks to one origin and no CORS or
   API keys are involved on the frontend. Override with DIXLAB_API. */
const api = process.env.DIXLAB_API || 'http://127.0.0.1:8000';
const proxy = {
  '/api': { target: api, changeOrigin: true },
  '/uploads': { target: api, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
