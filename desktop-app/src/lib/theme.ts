// Thèmes portés à l'identique du prototype ScaleFlow.dc.html (_theme()).
// Le thème suit l'infrastructure choisie : Cloud = cyan premium, GeeLark = violet.

export type InfraKey = 'geelark' | 'cloud'

export interface Theme {
  cloud: boolean
  accent: string
  accentSoft: string
  accentText: string
  accentBtn: string
  accentBtnEdge: string
  tone: string
  selBg: string
  selEdge: string
  navBg: string
  appBg: string
  panelBg: string
  panelEdge: string
  mainWash: string
  rim: string
}

export function themeFor(infra: InfraKey): Theme {
  return infra === 'cloud'
    ? {
        cloud: true,
        accent: '#06B6D4', accentSoft: '#22D3EE', accentText: '#67E8F9',
        accentBtn: '#0891B2', accentBtnEdge: '#06B6D4',
        tone: '6,182,212',
        selBg: 'rgba(6,182,212,0.09)', selEdge: 'rgba(6,182,212,0.4)',
        navBg: 'linear-gradient(178deg,#0A1216,#080D11 62%)',
        appBg: '#070C10',
        panelBg: 'linear-gradient(168deg,#0E161B,#0C1317)',
        panelEdge: 'rgba(103,232,249,0.09)',
        mainWash: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(6,182,212,0.06), transparent 62%)',
        rim: 'linear-gradient(180deg, transparent, rgba(103,232,249,0.34) 22%, rgba(103,232,249,0.34) 78%, transparent)',
      }
    : {
        cloud: false,
        accent: '#8B5CF6', accentSoft: '#A78BFA', accentText: '#C4B5FD',
        accentBtn: '#7C3AED', accentBtnEdge: '#8B5CF6',
        tone: '139,92,246',
        selBg: 'rgba(139,92,246,0.08)', selEdge: 'rgba(139,92,246,0.4)',
        navBg: '#0E0E13',
        appBg: '#0B0B0F',
        panelBg: '#101015',
        panelEdge: 'rgba(255,255,255,0.06)',
        mainWash: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(139,92,246,0.045), transparent 62%)',
        rim: 'none',
      }
}

// Les deux infrastructures (porté de _infras()).
export interface Infra {
  k: InfraKey
  name: string
  short: string
  tone: string
  color: string
  icon: string
  desc: string
  boot: string
  quota: string
  beta?: boolean
}

export const INFRAS: Record<InfraKey, Infra> = {
  geelark: {
    k: 'geelark', name: 'GeeLark', short: 'GeeLark',
    tone: '139,92,246', color: '#C4B5FD',
    icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01',
    desc: 'Appareils loués · automatisation RPA GeeLark',
    boot: '~45 s', quota: '200 max',
  },
  cloud: {
    k: 'cloud', name: 'ScaleFlow Cloud', short: 'Cloud',
    tone: '6,182,212', color: '#67E8F9',
    icon: 'M17.5 19a4.5 4.5 0 1 0-1.2-8.8A6 6 0 0 0 5 12.5 3.5 3.5 0 0 0 6.5 19z',
    desc: 'Nos appareils · agent natif ScaleFlow',
    boot: '3,2 s', quota: 'illimité', beta: true,
  },
}
