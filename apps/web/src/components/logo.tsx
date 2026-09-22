export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#245edc" />
      <circle cx="18" cy="15" r="4.5" fill="#fff" />
      <circle cx="30" cy="15" r="4.5" fill="#fff" />
      <circle cx="24" cy="24" r="4.5" fill="#fff" />
      <path
        d="M6 35c3-5 9-5 12 0s9 5 12 0 9-5 12 0"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark className="size-6 shrink-0" />
      <span className="text-sm font-semibold tracking-tight">family-pool</span>
    </span>
  )
}
