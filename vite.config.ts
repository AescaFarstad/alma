import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';

// Custom plugin to serve vector tiles with correct headers and set COOP/COEP
const vectorTilesPlugin = () => {
  const publicDir = path.join(process.cwd(), 'public');
  return {
  name: 'vector-tiles-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
    // Set COOP/COEP headers for SAB support
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    if (req.url && req.url.startsWith('/tiles/') && req.url.endsWith('.pbf')) {
      const filePath = path.join(publicDir, req.url);

      if (fs.existsSync(filePath)) {
      // File exists, set correct headers for PBF vector tiles
      res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
      // Disable caching during development
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return next();
      } else {
      // If tile does not exist, send a 204 No Content response.
      // MapLibre handles this gracefully without logging console errors.
      res.statusCode = 204;
      return res.end();
      }
    }
    return next();
    });
  }
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), vectorTilesPlugin()],
  server: {
  port: 5174,
  fs: {
    // Prevent Vite from trying to compress .pbf files
    deny: ['.pbf']
  },
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  }
  },
  build: {
  target: 'esnext'
  },
  define: {
  global: 'globalThis',
  },
  optimizeDeps: {
  include: ['maplibre-gl']
  }
}); 