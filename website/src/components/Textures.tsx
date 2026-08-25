/** Grain animé + scanlines : ce qui casse le rendu « généré ». */
export function Textures() {
  return (
    <>
      <div
        aria-hidden="true"
        className="animate-sf-grain pointer-events-none fixed -inset-1/2 z-40 opacity-[0.032]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[39] opacity-50"
        style={{
          background:
            'repeating-linear-gradient(180deg, transparent 0 2px, rgba(255,255,255,0.013) 2px 3px)',
        }}
      />
    </>
  )
}
