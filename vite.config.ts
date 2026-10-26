import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Port 5180, not 5173: localStorage is per origin, and the other hackathon entry uses 5173.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
