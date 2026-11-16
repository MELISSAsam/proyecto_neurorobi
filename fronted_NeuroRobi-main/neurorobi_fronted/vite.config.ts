import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  if (process.env.VERCEL) {
    for (const key of ['VITE_API_URL', 'VITE_WS_URL']) {
      const value = env[key];
      if (!value || !/^https:\/\/[^/]+$/.test(value)) {
        throw new Error(`${key} debe ser el dominio HTTPS del backend, sin barra final ni /api`);
      }
    }
  }
  return {
  plugins: [react(), tailwindcss()],
  // Configure TypeScript aliases
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@context': '/src/context',
      '@pages': '/src/pages',
      '@utils': '/src/utils',
      '@hooks': '/src/hooks',
      '@types': '/src/types',
    },
  },
  };
})
