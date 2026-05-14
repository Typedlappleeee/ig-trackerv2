export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-grad)" />
        <path d="M9 22V10h4l4 7 4-7h4v12h-3v-7l-3 5h-4l-3-5v7H9z" fill="white" />
      </svg>
      <span className="text-lg font-black text-white tracking-tight">
        Scale<span className="gradient-text">Flow</span>
      </span>
    </div>
  )
}
