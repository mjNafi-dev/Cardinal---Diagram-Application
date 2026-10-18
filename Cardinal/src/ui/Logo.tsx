/** Cardinal line mark — single-stroke line art, no eyes (by design). */
export function Logo({ size = 26, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" aria-label="Cardinal">
      <path d="M33 33 C33 22 40 15 54 10 L50 24 C61 27 67 37 67 50 C67 56 66 60 64 64 L86 78 L81 83 L58 71 C50 75 40 73 35 64 C32 58 32 50 33 43" />
      <path d="M33 33 L22 38 L33 43" />
      <path d="M43 49 C53 47 61 53 64 64" />
      <path d="M47 73 L46 82 M55 73 L55 82" />
      <path d="M30 82 L66 82" />
    </svg>
  );
}
