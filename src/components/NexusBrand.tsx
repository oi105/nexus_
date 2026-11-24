import React from 'react';
import { getAvatarTone, getInitials } from '../utils/nexusLogic';

export function NexusLogo({
  size = 28,
  inverted = false,
}: {
  size?: number;
  inverted?: boolean;
}) {
  const stroke = inverted ? '#FFFFFF' : '#172033';
  const accent = '#365BEE';
  const nodeFill = inverted ? '#172033' : '#FFFFFF';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Interconnected N paths */}
      <path
        d="M8 24V8L24 24V8"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 16L16 16L24 8"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 3"
      />
      {/* Linked nodes */}
      <circle cx="8" cy="8" r="2.75" fill={nodeFill} stroke={stroke} strokeWidth="2" />
      <circle cx="8" cy="24" r="2.75" fill={nodeFill} stroke={stroke} strokeWidth="2" />
      <circle cx="24" cy="8" r="2.75" fill={accent} stroke={accent} strokeWidth="1.5" />
      <circle cx="24" cy="24" r="2.75" fill={nodeFill} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

export function UserAvatar({
  name,
  photoURL,
  size = 'md',
}: {
  name: string;
  photoURL?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const [imgError, setImgError] = React.useState(false);

  const dims =
    size === 'xs'
      ? 'w-6 h-6 text-[10px]'
      : size === 'sm'
        ? 'w-7 h-7 text-[11px]'
        : size === 'lg'
          ? 'w-14 h-14 text-[18px]'
          : 'w-9 h-9 text-[12px]';

  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${dims} rounded-full object-cover border border-[#DFE5F0] shrink-0`}
      />
    );
  }

  const tone = getAvatarTone(name);
  return (
    <span
      aria-label={name}
      style={{
        backgroundColor: tone.bg,
        color: tone.text,
        borderColor: tone.border,
      }}
      className={`${dims} rounded-full border font-display font-semibold inline-flex items-center justify-center shrink-0 select-none`}
    >
      {getInitials(name)}
    </span>
  );
}
