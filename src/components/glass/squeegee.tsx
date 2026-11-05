/**
 * An original illustration of a professional window squeegee: rubber blade, steel channel,
 * clamp and a brand-coloured grip. The blade's centre sits at (200, 9), which is the point that
 * follows the cleaning path.
 */
export function Squeegee() {
  return (
    <svg viewBox="0 0 400 270" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-full w-full">
      <defs>
        <linearGradient id="sq-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f7f6" />
          <stop offset="0.35" stopColor="#c9d1ce" />
          <stop offset="0.6" stopColor="#8f9a96" />
          <stop offset="1" stopColor="#dfe5e3" />
        </linearGradient>
        <linearGradient id="sq-rubber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4441" />
          <stop offset="0.5" stopColor="#151b19" />
          <stop offset="1" stopColor="#262e2b" />
        </linearGradient>
        <linearGradient id="sq-grip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0f2c2c" />
          <stop offset="0.3" stopColor="#245656" />
          <stop offset="0.55" stopColor="#408078" />
          <stop offset="1" stopColor="#153636" />
        </linearGradient>
        <linearGradient id="sq-clamp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d8884" />
          <stop offset="0.45" stopColor="#eef2f0" />
          <stop offset="1" stopColor="#6f7a76" />
        </linearGradient>
      </defs>

      {/* Rubber blade */}
      <rect x="6" y="2" width="388" height="14" rx="3" fill="url(#sq-rubber)" />
      <rect x="10" y="3" width="380" height="2" rx="1" fill="#ffffff" opacity="0.18" />

      {/* Steel channel */}
      <path d="M4 14 H396 a4 4 0 0 1 4 4 V34 a6 6 0 0 1 -6 6 H6 a6 6 0 0 1 -6 -6 V18 a4 4 0 0 1 4 -4 Z" fill="url(#sq-steel)" />
      <rect x="8" y="18" width="384" height="3" rx="1.5" fill="#ffffff" opacity="0.6" />
      <circle cx="22" cy="27" r="4" fill="#7b8682" />
      <circle cx="378" cy="27" r="4" fill="#7b8682" />

      {/* Clamp */}
      <path d="M160 38 H240 L226 78 H174 Z" fill="url(#sq-clamp)" />
      <rect x="170" y="74" width="60" height="12" rx="4" fill="#5f6b67" />
      <circle cx="200" cy="56" r="6" fill="#56625e" />
      <circle cx="200" cy="56" r="2.5" fill="#c9d1ce" />

      {/* Grip */}
      <rect x="176" y="84" width="48" height="172" rx="22" fill="url(#sq-grip)" />
      {[110, 132, 154, 176, 198, 220].map((y) => (
        <rect key={y} x="182" y={y} width="36" height="3" rx="1.5" fill="#0b2222" opacity="0.45" />
      ))}
      <rect x="176" y="92" width="48" height="8" fill="#80c8a0" />
      <rect x="187" y="92" width="7" height="156" rx="3.5" fill="#ffffff" opacity="0.14" />
      <circle cx="200" cy="244" r="6" fill="#0b2222" opacity="0.6" />
    </svg>
  );
}

/** Blade centre as a fraction of the illustration, used as the transform origin. */
export const BLADE_ORIGIN = { x: 0.5, y: 9 / 270 };
export const SQUEEGEE_ASPECT = 270 / 400;
