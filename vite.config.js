import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served under /blues on the unified domain (Vercel multi-zone).
  base: '/blues/',
  plugins: [react()],
  server: { port: 5187 },
});
