/** Halos radiaux animés, fixés derrière tout le contenu. */
export function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <div
        className="animate-aurora absolute -top-80 left-1/2 h-[840px] w-[840px] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 68%)', filter: 'blur(110px)' }}
      />
      <div
        className="animate-aurora absolute top-[20%] -left-44 h-[560px] w-[560px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.13) 0%, transparent 70%)', filter: 'blur(110px)', animationDelay: '-6s' }}
      />
      <div
        className="animate-aurora absolute bottom-[6%] -right-36 h-[620px] w-[620px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.10) 0%, transparent 70%)', filter: 'blur(120px)', animationDelay: '-12s' }}
      />
    </div>
  )
}
