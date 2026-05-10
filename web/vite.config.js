import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During local dev:
//   - run Functions on :7071 (cd api && npm start)
//   - or run the SWA CLI on :4280 which proxies both api + auth
// Set the proxy target accordingly. Default below talks to the SWA CLI.
const SWA_CLI = 'http://localhost:4280';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':   SWA_CLI,
      '/.auth': SWA_CLI
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
