import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.VITE_API_KEY || env.VISUAL_ENGINE_API_KEY || 'dev-key';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          headers: {
            'X-API-Key': apiKey,
          },
        },
        '/ws': {
          target: 'ws://127.0.0.1:3001',
          ws: true,
        },
      },
    },
  };
});
