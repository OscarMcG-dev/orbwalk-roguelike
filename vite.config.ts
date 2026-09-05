import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from the root of https://1v5.dev/ in production, so base stays '/'.
export default defineConfig({
  plugins: [react()],
  server: { port: 5199, strictPort: false },
});
