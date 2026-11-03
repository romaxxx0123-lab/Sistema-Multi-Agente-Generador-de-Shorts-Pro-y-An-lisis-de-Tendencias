import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Modelos de Blender (src/assets/models, importados con ?inline como data URL).
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2022',
    // Un solo módulo a propósito (build-single lo incrusta y falla si aparece un trozo aparte).
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
