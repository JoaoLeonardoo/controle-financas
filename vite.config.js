import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// O "base" precisa ser o nome do repositório no GitHub Pages: '/nome-do-repo/'
// Em desenvolvimento local fica '/'. Defina VITE_BASE_PATH no .env (ou no GitHub Actions).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
  }
})
