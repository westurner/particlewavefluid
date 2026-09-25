import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const basePath = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
  server: {
    watch: {
      usePolling: true
    }
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/examples/') || id.includes('/three/addons/')) return 'three-extras';
          if (id.includes('/three/')) return 'three-core';
          if (id.includes('/@react-three/')) return 'react-three';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
          return undefined;
        }
      }
    }
  }
});