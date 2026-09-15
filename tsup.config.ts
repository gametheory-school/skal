import { defineConfig } from 'tsup'

export default defineConfig([
  // Engine/shared code — no 'use client' directive
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  // UI components — all are React client components
  {
    entry: ['src/ui.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    banner: { js: "'use client'" },
    external: [
      'react',
      'react-dom',
      'next/navigation',
      'next/navigation.js',
    ],
  },
])
