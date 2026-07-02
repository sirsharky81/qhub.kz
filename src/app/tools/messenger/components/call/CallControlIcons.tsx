"use client";

interface IconProps {
  className?: string;
}

export function MicIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-1 4v1a5 5 0 01-10 0v-1H5v1a7 7 0 006 6.92V22h2v-2.08A7 7 0 0019 16v-1h-3z" />
    </svg>
  );
}

export function MicOffIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V6a3 3 0 00-5.45-1.74l1.5 1.5a1 1 0 011.28 1.28l1.67 1.67zM5.27 3L4 4.27l3.03 3.03A7 7 0 005 16v1h2v-1a5 5 0 014.9-4.27L17.73 19 19 17.73 5.27 3zM12 22h2v-2.08A7 7 0 0019 16v-1h-2v1a5 5 0 01-3.9 4.9L12 22z" />
    </svg>
  );
}

export function SpeakerIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4.03v8.05a4.5 4.5 0 002.5-4.02zM14 3.23v2.06a7 7 0 010 13.54v2.06a9 9 0 000-17.66z" />
    </svg>
  );
}

export function SpeakerOffIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.5 12a4.5 4.5 0 00-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.9 8.9 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06a7 7 0 011.98 8.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

export function PhoneDownIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <g transform="rotate(135 12 12)">
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.01l-2.2 2.22z" />
      </g>
    </svg>
  );
}
