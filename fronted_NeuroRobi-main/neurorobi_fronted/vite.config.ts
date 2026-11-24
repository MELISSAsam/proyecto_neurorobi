import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  if (process.env.VERCEL) {
    const apiUrl = env.VITE_API_URL;
    if (!apiUrl || !/^https:\/\/[^/]+$/.test(apiUrl)) {
      throw new Error('VITE_API_URL debe ser el dominio HTTPS del backend, sin barra final ni /api');
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
