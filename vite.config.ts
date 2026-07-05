import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf('node_modules/@supabase') >= 0) {
            return 'supabase';
          }
          if (id.indexOf('node_modules/react') >= 0 || id.indexOf('node_modules/react-dom') >= 0) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [react()],
});
