export function Logo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 4 28 16 16 28 4 16Z" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="3.1" fill="var(--accent-2)" />
    </svg>
  );
}
