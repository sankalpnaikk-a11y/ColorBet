import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_PUBLIC_PATH || '/ColorBet/'

export default defineConfig({
  plugins: [react()],
  base
})
