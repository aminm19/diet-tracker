import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The workspace's single .env lives at the project root (one level up),
  // not inside client/ — point Vite there so VITE_-prefixed vars are
  // actually loaded (Vite's default envDir is the project root, i.e.
  // client/ itself, which has no .env file).
  envDir: fileURLToPath(new URL('..', import.meta.url)),
})
