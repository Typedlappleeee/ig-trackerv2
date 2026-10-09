// Thèmes portés à l'identique du prototype ScaleFlow.dc.html (_theme()).
// Le thème suit l'infrastructure choisie : Cloud = cyan, GeeLark = violet, iRemoTech = ambre.
// Style « SaaS épuré » : surfaces plates et neutres communes, seul l'accent change.

export type InfraKey = 'geelark' | 'iremotech' | 'cloud' | 'blowsome'

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
  if (infra === 'iremotech') {
    // Thème iRemoTech — ambre/or (vrais iPhones, automatisation par vision).
    return {
      cloud: false,
      accent: '#E9C46A', accentSoft: '#F0D48A', accentText: '#F3DDA0',
      accentBtn: '#D9A93E', accentBtnEdge: '#E9C46A',
      tone: '233,196,106',
      selBg: 'rgba(233,196,106,0.1)', selEdge: 'rgba(233,196,106,0.45)',
      navBg: '#0A0A0B',
      appBg: '#0A0A0B',
      panelBg: '#111113',
      panelEdge: 'rgba(255,255,255,0.07)',
      mainWash: '#0A0A0B',
      rim: 'none',
    }
  }
  if (infra === 'blowsome') {
    // Thème VIP Blowsome — mauve premium + or (design system de la sous-app web).
    return {
      cloud: false,
      accent: '#A855F7', accentSoft: '#C084FC', accentText: '#D8B4FE',
      accentBtn: '#9333EA', accentBtnEdge: '#A855F7',
      tone: '168,85,247',
      selBg: 'rgba(168,85,247,0.1)', selEdge: 'rgba(168,85,247,0.45)',
      navBg: '#0A0A0B',
      appBg: '#0A0A0B',
      panelBg: '#111113',
      panelEdge: 'rgba(255,255,255,0.07)',
      mainWash: '#0A0A0B',
      rim: 'none',
    }
  }
  return infra === 'cloud'
    ? {
        cloud: true,
        accent: '#06B6D4', accentSoft: '#22D3EE', accentText: '#67E8F9',
        accentBtn: '#0891B2', accentBtnEdge: '#06B6D4',
        tone: '6,182,212',
        selBg: 'rgba(6,182,212,0.09)', selEdge: 'rgba(6,182,212,0.4)',
        navBg: '#0A0A0B',
        appBg: '#0A0A0B',
        panelBg: '#111113',
        panelEdge: 'rgba(255,255,255,0.07)',
        mainWash: '#0A0A0B',
        rim: 'none',
      }
    : {
        cloud: false,
        accent: '#8B7CF6', accentSoft: '#A99CF8', accentText: '#C4BBFB',
        accentBtn: '#7462E8', accentBtnEdge: '#8B7CF6',
        tone: '139,92,246',
        selBg: 'rgba(139,92,246,0.08)', selEdge: 'rgba(139,92,246,0.4)',
        navBg: '#0A0A0B',
        appBg: '#0A0A0B',
        panelBg: '#111113',
        panelEdge: 'rgba(255,255,255,0.07)',
        mainWash: '#0A0A0B',
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
  iremotech: {
    k: 'iremotech', name: 'iRemoTech', short: 'iRemoTech',
    tone: '233,196,106', color: '#F3DDA0',
    icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M11 18h2',
    desc: 'Vrais iPhones jailbreak · automatisation par vision (Crane)',
    boot: '~30 s', quota: 'par appareil',
  },
  cloud: {
    k: 'cloud', name: 'ScaleFlow Cloud', short: 'Cloud',
    tone: '6,182,212', color: '#67E8F9',
    icon: 'M17.5 19a4.5 4.5 0 1 0-1.2-8.8A6 6 0 0 0 5 12.5 3.5 3.5 0 0 0 6.5 19z',
    desc: 'Nos appareils · agent natif ScaleFlow',
    boot: '3,2 s', quota: 'illimité', beta: true,
  },
  blowsome: {
    k: 'blowsome', name: 'Blowsome', short: 'VIP',
    tone: '168,85,247', color: '#D8B4FE',
    icon: 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z',
    desc: 'Agence VIP · gestion de parc premium',
    boot: '—', quota: 'sur mesure',
  },
}
