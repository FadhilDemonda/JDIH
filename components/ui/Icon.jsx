'use client';

const PATHS = {
  doc: (
    <>
      <path d="M6 2.5h6l4 4V17a1.5 1.5 0 01-1.5 1.5h-8.5A1.5 1.5 0 014.5 17V4A1.5 1.5 0 016 2.5z" />
      <path d="M12 2.5v4h4M7.5 10.5h5M7.5 13.5h3.5" />
    </>
  ),
  folder: <path d="M3 5.5A1.5 1.5 0 014.5 4h3.4l1.6 1.8h6A1.5 1.5 0 0117 7.3v7.2a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5v-9z" />,
  edit: <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />,
  check: <path d="M16.5 5.5l-8 8-4-4" />,
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.5" />
    </>
  ),
  bell: (
    <>
      <path d="M15 7a5 5 0 10-10 0c0 4.5-2 6-2 6h14s-2-1.5-2-6z" />
      <path d="M8.5 16a1.7 1.7 0 003 0" />
    </>
  ),
  building: <path d="M4 17.5h12M5.5 17.5V4a1 1 0 011-1h7a1 1 0 011 1v13.5M8.5 6.5h1M11.5 6.5h1M8.5 9.5h1M11.5 9.5h1M9.5 17.5v-4h1v4" />,
  users: (
    <>
      <circle cx="8" cy="7" r="2.5" />
      <path d="M3.5 16.5a4.5 4.5 0 019 0" />
      <circle cx="14.5" cy="7.5" r="2" />
      <path d="M14 12.5a3.5 3.5 0 013.5 4" />
    </>
  ),
  shield: <path d="M10 2.5l6 2.5v4.5c0 4-2.5 6.8-6 8-3.5-1.2-6-4-6-8V5l6-2.5z" />,
  tag: (
    <>
      <path d="M3.5 10V4.5a1 1 0 011-1H10l6.5 6.5-5.5 5.5L3.5 10z" />
      <circle cx="7" cy="7" r="1" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17a6 6 0 0112 0" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  download: <path d="M10 3.5v9M6.5 9.5L10 13l3.5-3.5M4 16.5h12" />,
  arrowLeft: <path d="M15 10H5M9.5 5.5L5 10l4.5 4.5" />,
  upload: <path d="M10 13V4.5M6.5 8L10 4.5 13.5 8M4 15.5h12" />,
  up: <path d="M10 14V6M6.5 9.5L10 6l3.5 3.5" />,
  down: <path d="M10 6v8M6.5 10.5L10 14l3.5-3.5" />,
  chevronDown: <path d="M5.5 7.5L10 12l4.5-4.5" />,
  trash: <path d="M4.5 6h11M8 6V4h4v2M6 6v10.5a1 1 0 001 1h6a1 1 0 001-1V6" />,
  dots: (
    <>
      <circle cx="10" cy="4.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13l4 4" />
    </>
  ),
  pause: <path d="M7 4v12M13 4v12" />,
  play: <path d="M6 3.5l10 6.5-10 6.5z" />,
  undo: <path d="M5 8.5h7a4 4 0 110 8H9M5 8.5L8 5.5M5 8.5L8 11.5" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
  logout: <path d="M12.5 15.5H5a1.5 1.5 0 01-1.5-1.5V6A1.5 1.5 0 015 4.5h7.5M13 13l3.5-3L13 7M16.5 10H8" />,
  eye: (
    <>
      <path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z" />
      <circle cx="10" cy="10" r="2.2" />
    </>
  ),
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || undefined}
      aria-hidden="true"
    >
      {PATHS[name] || null}
    </svg>
  );
}
