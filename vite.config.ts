import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from https://oscarmcg-dev.github.io/orbwalk-roguelike/ in production,
// from the root in dev. BASE_URL follows this, so use it for any absolute link.
const base = process.env.GITHUB_PAGES === 'true' ? '/orbwalk-roguelike/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5199, strictPort: false },
});
