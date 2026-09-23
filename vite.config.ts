import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('node_modules/firebase')) return 'firebase-vendor';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'pdf-vendor';
          if (id.includes('node_modules/xlsx')) return 'excel-vendor';
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/date-fns')) return 'ui-vendor';
        }
      }
    }
  }
}))
