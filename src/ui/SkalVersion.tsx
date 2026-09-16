'use client'

// Injected at build time by tsup from package.json — always matches the installed skal version.
declare const process: { env: { SKAL_VERSION?: string } }
const SKAL_VERSION = process.env.SKAL_VERSION ?? '0.0.0'

/**
 * Minimal version label for consumer shells.
 * Renders "skal <version>" in a small monospace font.
 * Consumers place it in their modal chrome — same visual rhythm as
 * axon's "powered by axon <version>" line in GameTheoryBadge.
 */
export function SkalVersion({ className }: { className?: string }) {
  return (
    <span
      className={className ?? 'font-mono text-[8px] text-gray-400'}
    >
      skal {SKAL_VERSION}
    </span>
  )
}
