import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Modelos de Blender (src/assets/models, importados con ?inline como data URL).
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
