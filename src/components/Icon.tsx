// Inline SVG only, so nothing is fetched. The words beside an icon always carry the meaning, so every icon
// is hidden from assistive tech and takes the text colour (which also keeps it visible in print). With no
// accessible name to select by, the test ID is how a test tells a check from a cross.

export type IconName = 'check' | 'clock' | 'cross' | 'dash' | 'shield-slash' | 'shield-check'

// One shield outline shared by both shields, so trusted and untrusted read as a pair.
const SHIELD =
  'M8 1 2.5 3v4.2c0 3.3 2.3 6.3 5.5 7.3 3.2-1 5.5-4 5.5-7.3V3L8 1zm0 1.6L3.8 4.1v3.1c0 2.6 1.7 5 4.2 5.9 2.5-.9 4.2-3.3 4.2-5.9V4.1L8 2.6z'

const PATHS: Record<IconName, readonly string[]> = {
  check: ['M6.2 11.6 2.6 8l1.1-1.1 2.5 2.5 6.1-6.1 1.1 1.1z'],
  clock: [
    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
    'M7.25 4.5h1.5v3.1l2.2 1.3-.75 1.3-2.95-1.75z',
  ],
  cross: ['M4.2 3.1 8 6.9l3.8-3.8 1.1 1.1L9.1 8l3.8 3.8-1.1 1.1L8 9.1l-3.8 3.8-1.1-1.1L6.9 8 3.1 4.2z'],
  dash: ['M3 7h10v2H3z'],
  'shield-slash': [SHIELD, 'M3.2 2.3 13.7 12.8l-.9.9L2.3 3.2z'],
  'shield-check': [SHIELD, 'M7.3 10.2 5 7.9l.9-.9 1.4 1.4 2.8-2.8.9.9z'],
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={`icon icon-${name}`}
      data-testid={`icon-${name}`}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} fillRule="evenodd" />
      ))}
    </svg>
  )
}
