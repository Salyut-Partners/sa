import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/editor',
  publicDir: '../../public',
  plugins: [react()],
  build: { outDir: '../../dist', emptyOutDir: true },
  server: {
    port: 5181,
    proxy: { '/api': 'http://127.0.0.1:5180' },
  },
});
