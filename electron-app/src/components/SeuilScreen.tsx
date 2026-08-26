import { useEffect, useRef, useState } from 'react';

/**
 * SeuilScreen — l'écran d'intro « Seuil » de ScaleFlow (avant connexion).
 *
 * Reproduction fidèle du prototype `_redesign/_v5/_redesign/prototypes/seuil.dc.html`.
 * Chronologie ≈ 8 s : traversée du tunnel (anneaux, poussière, horizon, tremblement,
 * télémétrie, flash) → atterrissage du mur de téléphones → révélation du titre
 * « SCALE » (Space Grotesk 700) + « Flow » (Instrument Serif 400) lettre par lettre →
 * cadre, promesse, bouton « Entrer », pied de page.
 *
 * RÈGLES ABSOLUES (voir ANIMATIONS.md §1) :
 *  1. Animations d'entrée en CSS pur (bloc <style> ci-dessous). Seul le pourcentage
 *     de télémétrie (+ compteur live) est piloté en JS via setInterval.
 *  2. `opacity: 0` inline sur tout élément à animation retardée / infinite+delay.
 *  3. Aucun balayage oblique (skewX + translation) — seuls les 2 traits du logo skewX.
 *  4. Le dégradé background-clip:text va sur le <span> du MOT « Flow ».
 *  5. zLand n'anime PAS l'opacité ; c'est zAppear qui lit --o.
 *  6. prefers-reduced-motion : saute l'anim, montre l'état final (titre + bouton visibles).
 *  7. Le bouton « Entrer » appelle toujours onEnter.
 */

// Style qui autorise les custom properties CSS (--rot, --o, --sink, --a…).
type CSS = React.CSSProperties & Record<string, string | number>;

const CSS_KEYFRAMES = `
/* ── tunnel ── */
@keyframes zRing{0%{transform:translateZ(-2800px) rotate(var(--rot)) scale(1);opacity:0}9%{opacity:.95}64%{opacity:.6}100%{transform:translateZ(1000px) rotate(calc(var(--rot) + 50deg)) scale(1.35);opacity:0}}
@keyframes zDust{0%{transform:translateZ(-2400px);opacity:0}22%{opacity:.75}100%{transform:translateZ(900px);opacity:0}}
@keyframes zHorizon{0%{opacity:0;transform:scale(.15)}40%{opacity:.5}86%{opacity:.9;transform:scale(1.5)}100%{opacity:0;transform:scale(2.6)}}
@keyframes zAperture{0%{box-shadow:inset 0 0 300px 200px #040409}70%{box-shadow:inset 0 0 240px 120px #040409}100%{box-shadow:inset 0 0 400px 260px #040409}}
@keyframes zShake{0%,72%{transform:translate(0,0)}76%{transform:translate(-8px,5px)}80%{transform:translate(7px,-6px)}84%{transform:translate(-5px,-3px)}88%{transform:translate(4px,3px)}92%,100%{transform:translate(0,0)}}
@keyframes zHud{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}
@keyframes zHudBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes zFlash{0%,78%{opacity:0}86%{opacity:1}94%{opacity:.5}100%{opacity:0}}
@keyframes zTunnelOut{0%,86%{visibility:visible;opacity:1}96%{opacity:0}100%{visibility:hidden;opacity:0}}

/* ── ambiance ── */
@keyframes zGrain{0%,100%{transform:translate(0,0)}20%{transform:translate(-2%,1%)}40%{transform:translate(1%,-2%)}60%{transform:translate(-1%,2%)}80%{transform:translate(2%,-1%)}}
@keyframes zVeil{0%,100%{opacity:.3;transform:translate(0,0) scale(1)}50%{opacity:.8;transform:translate(2%,-2%) scale(1.1)}}
@keyframes zSpark{0%,100%{opacity:.1;transform:translateY(0)}50%{opacity:.85;transform:translateY(-9px)}}
@keyframes zBlink{0%,100%{opacity:.18}50%{opacity:.9}}
@keyframes zBreathe{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.85;transform:scale(1.06)}}

/* ── mur ── */
@keyframes zLand{0%{transform:translateY(190px) rotateX(52deg) scale(.8)}100%{transform:translateY(0) rotateX(0) scale(1)}}
@keyframes zAppear{from{opacity:0}to{opacity:var(--o)}}
@keyframes zSettle{0%{transform:translateY(0)}100%{transform:translateY(var(--sink))}}
@keyframes zLive{0%{background:rgba(255,255,255,0.035);box-shadow:none}16%{background:rgba(240,171,252,0.62);box-shadow:0 0 26px 4px rgba(240,171,252,0.7)}48%{background:rgba(52,211,153,0.36);box-shadow:0 0 15px 1px rgba(52,211,153,0.4)}100%{background:rgba(139,92,246,0.13);box-shadow:none}}

/* ── contenu ── */
@keyframes zLetter{0%{opacity:0;transform:translateY(116%) scale(1.14);filter:blur(9px)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}
@keyframes zFade{from{opacity:0}to{opacity:1}}
@keyframes zUp{from{opacity:0;transform:translateY(18px);filter:blur(7px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
@keyframes zRule{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes zPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.6)}}
@keyframes zShine{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes zBloom{0%,100%{opacity:0}14%{opacity:.8}}
@keyframes zCorner{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes zFloatIn{from{opacity:0;transform:translateY(26px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
`;

// Graines de la constellation (identiques au prototype).
const SEEDS: [number, number, number][] = [
  [17, 8, 2.5], [31, 20, 1.5], [8, 34, 2], [23, 52, 1.5], [12, 26, 2],
  [38, 11, 1.5], [58, 15, 1.5], [79, 24, 1.5], [88, 44, 2], [72, 8, 1.5],
  [93, 13, 2], [4, 22, 1.5], [96, 34, 2], [28, 31, 1.5], [64, 36, 1.5], [46, 6, 2],
];

// Mur de téléphones : 15 hauteurs relatives.
const WALL_N = 15;
const HEIGHTS = [0.62, 0.74, 0.86, 0.95, 1, 0.95, 0.86, 0.78, 0.86, 0.95, 1, 0.95, 0.86, 0.74, 0.62];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

export function SeuilScreen({ onEnter }: { onEnter: () => void }) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [live, setLive] = useState(18420);
  const [hud, setHud] = useState(reduced ? 100 : 0);

  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hudTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Compteur « posts publiés aujourd'hui ».
    liveTimer.current = setInterval(() => setLive((v) => v + 1), 1500);

    // Pourcentage RÉEL de la télémétrie : 0 → 100 sur 4,4 s à partir de now+1100ms.
    if (!reduced) {
      const t0 = Date.now() + 1100;
      hudTimer.current = setInterval(() => {
        const p = Math.max(0, Math.min(1, (Date.now() - t0) / 4400));
        setHud(Math.round(p * 100));
        if (p >= 1 && hudTimer.current) {
          clearInterval(hudTimer.current);
          hudTimer.current = null;
        }
      }, 90);
    } else {
      setHud(100);
    }

    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
      if (hudTimer.current) clearInterval(hudTimer.current);
    };
  }, [reduced]);

  const hudPct = `${hud} %`;
  const hudPhones = String(Math.min(52, Math.round(hud * 0.52))).padStart(2, '0');
  const hudNode = 'NODE-' + String(3 + (hud % 7)).padStart(2, '0');
  const liveLabel = live.toLocaleString('fr-FR') + ' posts';

  // ── État du bouton (survol) ──
  const h = hover;
  const ctaEdge = h ? 'rgba(196,181,253,0.65)' : 'rgba(255,255,255,0.18)';
  const ctaBg = h ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.022)';
  const ctaColor = h ? '#F6F4FF' : 'rgba(226,222,255,0.78)';
  const ctaShadow = h ? '0 24px 64px -22px rgba(168,85,247,0.9)' : '0 12px 34px -20px rgba(0,0,0,0.8)';
  const ctaArrow = h ? 'translateX(7px)' : 'translateX(0)';
  const ctaRule = h ? '88%' : '0%';
  const ctaGlowOp = h ? 1 : 0.35;
  const ctaHaloEdge = h ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0)';
  const ctaHaloScale = h ? 1 : 0.88;
  const ctaHaloOp = h ? 1 : 0;

  // Helper : révèle un mot lettre par lettre (chaque lettre dans son masque overflow).
  const letters = (word: string, base: number, extra?: CSS) =>
    word.split('').map((ch, i) => (
      <span key={i} style={{ display: 'block', overflow: 'hidden', paddingBottom: '4px' }}>
        <span
          style={{
            display: 'block',
            ...(reduced
              ? { opacity: 1 }
              : { animation: `zLetter 1.1s cubic-bezier(0.16,1,0.3,1) ${(base + i * 0.075).toFixed(2)}s both` }),
            ...(extra || {}),
          } as CSS}
        >
          {ch}
        </span>
      </span>
    ));

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse 92% 72% at 50% 42%, #141122 0%, #08070f 48%, #040409 100%)',
        color: '#F2F0FF',
        fontFamily: "'Manrope',system-ui,sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <style>{CSS_KEYFRAMES}</style>

      {/* ═══ TUNNEL ═══ (sauté sous prefers-reduced-motion) */}
      {!reduced && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 96,
            pointerEvents: 'none',
            background: '#040409',
            perspective: '600px',
            perspectiveOrigin: '50% 47%',
            animation:
              'zTunnelOut 6.6s linear forwards, zShake 6.6s cubic-bezier(0.4,0,0.6,1) both',
          }}
        >
          {/* les dix anneaux */}
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
            {Array.from({ length: 10 }, (_, ring) => {
              const seats = 11;
              const rot = (ring * 16) % 360;
              return (
                <div
                  key={ring}
                  style={{
                    position: 'absolute',
                    top: '47%',
                    left: '50%',
                    width: 0,
                    height: 0,
                    transformStyle: 'preserve-3d',
                    '--rot': rot + 'deg',
                    opacity: 0,
                    animation: `zRing 5.9s cubic-bezier(0.55,0,0.45,1) ${(ring * 0.42).toFixed(2)}s both`,
                  } as CSS}
                >
                  {Array.from({ length: seats }, (_, k) => {
                    const a = (k / seats) * Math.PI * 2;
                    const R = 310;
                    const on = (k + ring) % 3 === 0;
                    return (
                      <span
                        key={k}
                        style={{
                          position: 'absolute',
                          left: (Math.cos(a) * R).toFixed(0) + 'px',
                          top: (Math.sin(a) * R * 0.72).toFixed(0) + 'px',
                          width: '26px',
                          height: '52px',
                          marginLeft: '-13px',
                          marginTop: '-26px',
                          borderRadius: '6px',
                          background: on ? 'rgba(192,132,252,0.34)' : 'rgba(255,255,255,0.05)',
                          border: '1px solid ' + (on ? 'rgba(216,180,254,0.62)' : 'rgba(255,255,255,0.11)'),
                          boxShadow: on ? '0 0 20px 2px rgba(192,132,252,0.5)' : 'none',
                          transform: `rotate(${(a * 180 / Math.PI + 90).toFixed(0)}deg)`,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* poussière stellaire (46 grains) — opacity:0 inline obligatoire */}
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
            {Array.from({ length: 46 }, (_, i) => {
              const a = (i * 2.399) % (Math.PI * 2);
              const R = 80 + ((i * 37) % 480);
              const big = i % 5 === 0;
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    top: '47%',
                    left: '50%',
                    marginLeft: (Math.cos(a) * R).toFixed(0) + 'px',
                    marginTop: (Math.sin(a) * R * 0.7).toFixed(0) + 'px',
                    width: big ? '3px' : '2px',
                    height: big ? '3px' : '2px',
                    borderRadius: '99px',
                    opacity: 0,
                    background: i % 4 === 0 ? '#67E8F9' : i % 3 === 0 ? '#F0ABFC' : '#fff',
                    animation: `zDust ${(2.4 + (i % 6) * 0.4).toFixed(2)}s linear ${((i * 0.1) % 3).toFixed(2)}s infinite`,
                  }}
                />
              );
            })}
          </div>

          {/* horizon au fond du tunnel */}
          <span
            style={{
              position: 'absolute',
              top: '47%',
              left: '50%',
              width: '340px',
              height: '340px',
              margin: '-170px 0 0 -170px',
              borderRadius: '99em',
              filter: 'blur(56px)',
              background:
                'radial-gradient(circle, rgba(240,171,252,0.75), rgba(168,85,247,0.35) 42%, transparent 70%)',
              animation: 'zHorizon 5.8s cubic-bezier(0.45,0,0.55,1) 0.3s both',
            }}
          />

          {/* vignette qui respire */}
          <span style={{ position: 'absolute', inset: 0, animation: 'zAperture 5.8s cubic-bezier(0.4,0,0.6,1) both' }} />

          {/* télémétrie */}
          <div
            style={{
              position: 'absolute',
              bottom: '11%',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '7px',
              width: 'min(320px,72vw)',
              animation: 'zHud 5.8s ease 0.9s both',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'monospace',
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: 'rgba(196,181,253,0.55)',
              }}
            >
              <span>CONNEXION AU RÉSEAU</span>
              <span style={{ color: '#67E8F9' }}>{hudPct}</span>
            </div>
            <span style={{ height: '1px', background: 'rgba(255,255,255,0.09)', display: 'block' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  background: 'linear-gradient(90deg,#A855F7,#67E8F9)',
                  transformOrigin: 'left',
                  animation: 'zHudBar 4.4s cubic-bezier(0.3,0,0.2,1) 1.1s both',
                }}
              />
            </span>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'monospace',
                fontSize: '8px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'rgba(148,163,184,0.4)',
              }}
            >
              <span>{hudPhones} APPAREILS</span>
              <span>{hudNode}</span>
            </div>
          </div>

          {/* flash blanc */}
          <span
            style={{
              position: 'absolute',
              inset: 0,
              background: '#fff',
              animation: 'zFlash 6.6s cubic-bezier(0.7,0,0.3,1) both',
            }}
          />
        </div>
      )}

      {/* textures */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '-50%',
          zIndex: 40,
          pointerEvents: 'none',
          opacity: 0.034,
          animation: reduced ? 'none' : 'zGrain 1.1s steps(4) infinite',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 39,
          pointerEvents: 'none',
          opacity: 0.4,
          background: 'repeating-linear-gradient(180deg, transparent 0 2px, rgba(255,255,255,0.012) 2px 3px)',
        }}
      />

      {/* voiles */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <span
          style={{
            position: 'absolute',
            top: '14%',
            left: '50%',
            width: '980px',
            height: '560px',
            marginLeft: '-490px',
            borderRadius: '99em',
            filter: 'blur(126px)',
            background: 'radial-gradient(ellipse, rgba(124,58,237,0.26), transparent 68%)',
            animation: reduced ? 'none' : 'zVeil 12s ease-in-out infinite',
          }}
        />
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            left: '18%',
            width: '620px',
            height: '460px',
            borderRadius: '99em',
            filter: 'blur(116px)',
            background: 'radial-gradient(ellipse, rgba(34,211,238,0.13), transparent 70%)',
            animation: reduced ? 'none' : 'zVeil 16s ease-in-out infinite',
            animationDelay: '-5s',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: '4%',
            right: '10%',
            width: '500px',
            height: '500px',
            borderRadius: '99em',
            filter: 'blur(118px)',
            background: 'radial-gradient(circle, rgba(236,72,153,0.1), transparent 70%)',
            animation: reduced ? 'none' : 'zVeil 19s ease-in-out infinite',
            animationDelay: '-9s',
          }}
        />
      </div>

      {/* constellation */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        {SEEDS.map(([x, y, r], i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: x + '%',
              top: y + '%',
              width: r + 'px',
              height: r + 'px',
              borderRadius: '99px',
              background: i % 4 === 0 ? '#C4B5FD' : '#fff',
              opacity: reduced ? 0.4 : 0,
              animation: reduced
                ? 'none'
                : `zSpark ${(6 + (i % 5) * 1.7).toFixed(1)}s ease-in-out ${(6.9 + i * 0.42).toFixed(2)}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ═══ MUR DE TÉLÉPHONES ═══ */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          height: '56%',
          pointerEvents: 'none',
          perspective: '1400px',
          WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 26%, #000 92%)',
          maskImage: 'linear-gradient(180deg, transparent, #000 26%, #000 92%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '9%',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 'clamp(8px,1.1vw,18px)',
            transform: 'translateX(-50%)',
            transformStyle: 'preserve-3d',
          }}
        >
          {Array.from({ length: WALL_N }, (_, i) => {
            const mid = Math.abs(i - (WALL_N - 1) / 2);
            const scaleY = HEIGHTS[i];
            const land = 6.5 + mid * 0.07;
            const lit = 7.15 + i * 0.1;
            const sink = (14 + mid * 5).toFixed(0) + 'px';
            const o = 0.62 - mid * 0.045;
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  width: 'clamp(34px,3.9vw,60px)',
                  '--o': o.toFixed(3),
                  opacity: reduced ? o : 0,
                  animation: reduced
                    ? 'none'
                    : `zLand 1.3s cubic-bezier(0.16,1,0.3,1) ${land.toFixed(2)}s both, zAppear 0.8s ease ${land.toFixed(2)}s both`,
                } as CSS}
              >
                <div
                  style={{
                    '--sink': sink,
                    animation: reduced ? 'none' : `zSettle 1.6s cubic-bezier(0.16,1,0.3,1) ${(lit + 0.9).toFixed(2)}s both`,
                  } as CSS}
                >
                  <div
                    style={{
                      borderRadius: 'clamp(6px,0.7vw,11px)',
                      padding: '2px',
                      background:
                        'linear-gradient(165deg, rgba(216,180,254,0.34), rgba(139,92,246,0.18) 46%, rgba(8,6,18,0.9))',
                      boxShadow:
                        '0 18px 40px -18px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.14)',
                      transform: `scaleY(${scaleY})`,
                      transformOrigin: 'bottom',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        borderRadius: 'clamp(5px,0.6vw,9px)',
                        overflow: 'hidden',
                        background: '#08060F',
                        border: '1px solid rgba(255,255,255,0.06)',
                        aspectRatio: '9 / 19',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '3px',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: reduced ? 'rgba(139,92,246,0.13)' : undefined,
                          animation: reduced ? 'none' : `zLive 2.6s cubic-bezier(0.3,0,0.2,1) ${lit.toFixed(2)}s both`,
                        }}
                      />
                      <span
                        style={{
                          position: 'relative',
                          width: '3px',
                          height: '3px',
                          borderRadius: '99px',
                          background: i % 3 === 0 ? '#34D399' : 'rgba(216,180,254,0.7)',
                          margin: '0 auto',
                          animation: reduced
                            ? 'none'
                            : `zBlink ${(3 + (i % 4) * 0.8).toFixed(1)}s ease-in-out ${(9.2 + i * 0.2).toFixed(1)}s infinite`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* éclat derrière le titre */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', overflow: 'hidden' }}>
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '40%',
            width: '940px',
            height: '440px',
            margin: '-220px 0 0 -470px',
            borderRadius: '99em',
            filter: 'blur(72px)',
            background: 'radial-gradient(ellipse, rgba(216,180,254,0.55), transparent 66%)',
            opacity: reduced ? 0.5 : undefined,
            animation: reduced ? 'none' : 'zBloom 2.2s ease-out 6.62s both',
          }}
        />
      </div>

      {/* ═══ CŒUR ═══ */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '0 32px',
          marginBottom: '6vh',
        }}
      >
        {/* sur-titre */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            ...(reduced ? { opacity: 1 } : { animation: 'zUp 1.1s cubic-bezier(0.16,1,0.3,1) 6.62s both' }),
          } as CSS}
        >
          <span
            style={{
              width: 'clamp(28px,5vw,60px)',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.5))',
              transformOrigin: 'right',
              ...(reduced ? {} : { animation: 'zRule 1.2s cubic-bezier(0.16,1,0.3,1) 6.76s both' }),
            } as CSS}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.36em',
              textTransform: 'uppercase',
              color: 'rgba(196,181,253,0.6)',
              whiteSpace: 'nowrap',
            }}
          >
            Instagram &amp; TikTok automation studio
          </span>
          <span
            style={{
              width: 'clamp(28px,5vw,60px)',
              height: '1px',
              background: 'linear-gradient(90deg, rgba(196,181,253,0.5), transparent)',
              transformOrigin: 'left',
              ...(reduced ? {} : { animation: 'zRule 1.2s cubic-bezier(0.16,1,0.3,1) 6.76s both' }),
            } as CSS}
          />
        </div>

        {/* titre SCALE + Flow */}
        <h1
          style={{
            position: 'relative',
            margin: '24px 0 0',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            fontSize: 'clamp(56px,10.5vw,152px)',
            lineHeight: 0.86,
            letterSpacing: '-0.045em',
          }}
        >
          <span
            style={{
              position: 'relative',
              display: 'flex',
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 700,
              color: '#F6F4FF',
            }}
          >
            {letters('SCALE', 6.66)}
          </span>
          {/* « Flow » : le dégradé background-clip:text est posé sur le span qui
              contient DIRECTEMENT le texte (sinon le clip ne traverse pas les
              wrappers overflow:hidden des lettres → mot invisible). */}
          <span style={{ position: 'relative', display: 'flex', marginLeft: '0.06em', fontFamily: "'Instrument Serif',Georgia,serif", fontWeight: 400 }}>
            <span style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.08em' }}>
              <span
                style={{
                  display: 'block',
                  background: 'linear-gradient(96deg,#A855F7,#C4B5FD 32%,#93C5FD 66%,#67E8F9)',
                  backgroundSize: '230% auto',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  ...(reduced
                    ? {}
                    : { animation: 'zLetter 1.1s cubic-bezier(0.16,1,0.3,1) 7.1s both, zShine 9s ease-in-out 8.2s infinite' }),
                }}
              >
                Flow
              </span>
            </span>
          </span>
        </h1>

        {/* promesse */}
        <p
          style={{
            margin: '20px 0 0',
            maxWidth: '560px',
            fontFamily: "'Instrument Serif',Georgia,serif",
            fontSize: 'clamp(17px,2vw,25px)',
            fontStyle: 'italic',
            lineHeight: 1.45,
            color: 'rgba(226,222,255,0.64)',
            ...(reduced ? { opacity: 1 } : { animation: 'zUp 1.1s cubic-bezier(0.16,1,0.3,1) 7.5s both' }),
          } as CSS}
        >
          L'usine de contenu des marques qui dominent Instagram &amp; TikTok.
        </p>

        {/* bouton Entrer — appelle TOUJOURS onEnter */}
        <button
          type="button"
          onClick={onEnter}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: 'relative',
            marginTop: '42px',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            ...(reduced ? { opacity: 1 } : { animation: 'zFloatIn 1.15s cubic-bezier(0.16,1,0.3,1) 7.7s both' }),
          } as CSS}
        >
          <span
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '19px 46px',
              borderRadius: '2px',
              border: '1px solid ' + ctaEdge,
              background: ctaBg,
              boxShadow: ctaShadow,
              transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: ctaColor,
                transition: 'color 0.4s ease',
              }}
            >
              Entrer
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: '13px',
                color: ctaColor,
                transform: ctaArrow,
                transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1), color 0.4s ease',
              }}
            >
              →
            </span>
          </span>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: '-2px',
              borderRadius: '4px',
              background: 'radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.5), transparent 70%)',
              filter: 'blur(16px)',
              opacity: ctaGlowOp,
              transition: 'opacity 0.5s ease',
              pointerEvents: 'none',
              animation: reduced ? 'none' : 'zBreathe 4.5s ease-in-out 8.9s infinite',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '-3px',
              width: ctaRule,
              height: '1px',
              marginLeft: `calc(${ctaRule} / -2)`,
              background: 'linear-gradient(90deg,transparent,#C4B5FD,transparent)',
              transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: '-16px',
              borderRadius: '5px',
              border: '1px solid ' + ctaHaloEdge,
              transform: `scale(${ctaHaloScale})`,
              opacity: ctaHaloOp,
              transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)',
              pointerEvents: 'none',
            }}
          />
        </button>

        {/* compteur live */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            marginTop: '30px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'rgba(148,163,184,0.42)',
            ...(reduced ? { opacity: 1 } : { animation: 'zFade 1.3s ease 7.95s both' }),
          } as CSS}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '99px',
              background: '#34D399',
              animation: reduced ? 'none' : 'zPulse 2.4s ease-in-out infinite',
            }}
          />
          <span>{liveLabel} publiés aujourd'hui</span>
        </div>
      </div>

      {/* cadre — quatre équerres */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
        {([
          { top: '34px', left: '36px', w: '22px', hh: '1px', d: 7.45 },
          { top: '34px', left: '36px', w: '1px', hh: '22px', d: 7.45 },
          { top: '34px', right: '36px', w: '22px', hh: '1px', d: 7.53 },
          { top: '34px', right: '36px', w: '1px', hh: '22px', d: 7.53 },
          { bottom: '34px', left: '36px', w: '22px', hh: '1px', d: 7.61 },
          { bottom: '34px', left: '36px', w: '1px', hh: '22px', d: 7.61 },
          { bottom: '34px', right: '36px', w: '22px', hh: '1px', d: 7.69 },
          { bottom: '34px', right: '36px', w: '1px', hh: '22px', d: 7.69 },
        ] as Array<{ top?: string; bottom?: string; left?: string; right?: string; w: string; hh: string; d: number }>).map(
          (c, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                top: c.top,
                bottom: c.bottom,
                left: c.left,
                right: c.right,
                width: c.w,
                height: c.hh,
                background: 'rgba(255,255,255,0.18)',
                ...(reduced ? { opacity: 1 } : { animation: `zCorner 0.8s ease ${c.d}s both` }),
              } as CSS}
            />
          ),
        )}
      </div>

      {/* marque (logo) */}
      <div
        style={{
          position: 'absolute',
          top: '30px',
          left: '50%',
          marginLeft: '-16px',
          zIndex: 24,
          ...(reduced ? { opacity: 1 } : { animation: 'zFade 1.2s ease 6.85s both' }),
        } as CSS}
      >
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            width: '32px',
            height: '32px',
            borderRadius: '9px',
            background: 'linear-gradient(145deg,#A855F7,#7C3AED)',
            boxShadow: '0 8px 22px -8px rgba(168,85,247,0.7), inset 0 1px 0 rgba(255,255,255,0.28)',
          }}
        >
          {/* seuls skewX autorisés : les deux barres du logo */}
          <span style={{ width: '14px', height: '3px', borderRadius: '99px', background: '#fff', transform: 'skewX(-14deg)' }} />
          <span style={{ width: '14px', height: '3px', borderRadius: '99px', background: '#fff', transform: 'skewX(14deg)' }} />
        </span>
      </div>

      {/* pied de page */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '26px 0',
          fontSize: '9.5px',
          fontWeight: 700,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'rgba(148,163,184,0.32)',
          ...(reduced ? { opacity: 1 } : { animation: 'zFade 1.3s ease 8.05s both' }),
        } as CSS}
      >
        <span>Paris — Worldwide</span>
        <span style={{ color: 'rgba(168,85,247,0.55)' }}>•</span>
        <span>MMXXVI</span>
      </div>
    </div>
  );
}

export default SeuilScreen;
