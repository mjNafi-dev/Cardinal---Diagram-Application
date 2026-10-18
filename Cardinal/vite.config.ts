import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// @ts-ignore — plain ESM helper shared with the production server
import { createStorageMiddleware } from './server/storage.mjs';

// The storage middleware saves projects as real files on disk (Documents\Cardinal),
// so the same API works in `npm run dev` and in the production server.
// `--mode sandbox` keeps test data in Cardinal/.sandbox-data instead.
export default defineConfig(({ mode }) => {
  // `--mode shots` uses Cardinal/.shots-data, a clean set used for the README screenshots
  const dataDir = mode === 'sandbox' ? path.resolve(__dirname, '.sandbox-data') : mode === 'shots' ? path.resolve(__dirname, '.shots-data') : undefined;
  const storage = () => ({
    name: 'cardinal-storage',
    configureServer(server: any) {
      server.middlewares.use(createStorageMiddleware(dataDir));
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(createStorageMiddleware(dataDir));
    },
  });
  return {
    plugins: [react(), storage()],
    build: { chunkSizeWarningLimit: 2000 },
  };
});
