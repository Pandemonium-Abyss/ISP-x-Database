// Paw print on a strip of yellow labeling tape — the Labrador mark.
export default function Logo({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="12" fill="#2d47bb" />
      <path d="M6 22 L10 19 L56 21 L59 18 L57 31 L59 45 L54 43 L9 46 L5 44 L7 33 Z" fill="#f4cf4e" />
      <g fill="#17212b">
        <ellipse cx="32" cy="37.5" rx="6.5" ry="5" />
        <ellipse cx="22.5" cy="30" rx="2.8" ry="3.6" />
        <ellipse cx="28.5" cy="25.5" rx="2.8" ry="3.6" />
        <ellipse cx="35.5" cy="25.5" rx="2.8" ry="3.6" />
        <ellipse cx="41.5" cy="30" rx="2.8" ry="3.6" />
      </g>
    </svg>
  );
}
