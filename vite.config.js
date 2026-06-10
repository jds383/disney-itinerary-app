import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/disney-itinerary-app/',
  build: {
    sourcemap: true,
  }
})
