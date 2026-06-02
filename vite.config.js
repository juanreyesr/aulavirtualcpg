import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar pdf (html2canvas + jspdf ~600KB) — solo se carga al descargar certificados
          'pdf-export': ['html2canvas', 'jspdf'],
          // React core
          'react-vendor': ['react', 'react-dom'],
          // Supabase
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
    // Ajustar warning de tamaño (los chunks grandes ya están separados)
    chunkSizeWarningLimit: 700,
  },
});
