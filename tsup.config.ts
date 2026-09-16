import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// Single source of truth for the in-product "powered by skal <version>" label.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string
}

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
    define: {
      'process.env.SKAL_VERSION': JSON.stringify(version),
    },
    external: [
      'react',
      'react-dom',
      'next/navigation',
      'next/navigation.js',
    ],
  },
])
