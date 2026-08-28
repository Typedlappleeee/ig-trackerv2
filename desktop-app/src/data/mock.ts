// Données fictives — le visuel d'abord. Branchées sur Supabase plus tard.

export type Health = number // 0-100
export type PhoneStatus = 'online' | 'warmup' | 'limited' | 'offline' | 'error'

export interface Phone {
  id: string
  name: string          // sf-cloud-01
  account: string       // @brand.paris
  group: string
  status: PhoneStatus
  health: Health
  followers: number
  posts7d: number
  proxy: string | null
  ip: string | null
  lastPost: string | null
}

const GROUPS = ['Ferme EU', 'Ferme US', 'Nouveaux', 'Clients']
const NAMES = ['brand.paris', 'studio.creatif', 'ugc.factory', 'growth.lab', 'viral.fr', 'daily.motiv', 'clip.master', 'fit.life', 'travel.co', 'food.daily']
const STATUSES: PhoneStatus[] = ['online', 'online', 'online', 'warmup', 'online', 'limited', 'online', 'offline']

export const PHONES: Phone[] = Array.from({ length: 52 }, (_, i) => {
  const st = STATUSES[i % STATUSES.length]
  const health = st === 'offline' ? 0 : st === 'limited' ? 40 + (i % 25) : 55 + (i * 7) % 45
  return {
    id: 'p' + (i + 1),
    name: 'sf-cloud-' + String(i + 1).padStart(2, '0'),
    account: '@' + NAMES[i % NAMES.length] + (i > 9 ? i : ''),
    group: GROUPS[i % GROUPS.length],
    status: st,
    health,
    followers: 800 + (i * 337) % 40000,
    posts7d: (i * 3) % 22,
    proxy: st === 'offline' ? null : GROUPS[i % 2] === 'Ferme EU' ? 'FR-' + String((i % 12) + 1).padStart(2, '0') : 'US-' + String((i % 9) + 1).padStart(2, '0'),
    ip: st === 'offline' ? null : `92.44.${11 + (i % 30)}.${8 + (i * 3) % 200}`,
    lastPost: i % 4 === 0 ? null : `il y a ${1 + (i % 20)} h`,
  }
})

export const KPIS = {
  phones: PHONES.length,
  online: PHONES.filter(p => p.status === 'online').length,
  videos: 347,
  posts7d: 1284,
  credits: 2480,
}

export const UPCOMING = [
  { icon: 'calendar', title: '24 comptes · Reel « Morning routine »', meta: "Aujourd'hui 18:00 · dans 3 h", tone: 'violet' as const, tag: 'programmé' },
  { icon: 'send', title: '18 comptes · Story + lien produit', meta: "Aujourd'hui 21:00 · dans 6 h", tone: 'violet' as const, tag: 'programmé' },
  { icon: 'flame', title: 'Warmup quotidien · groupe « Nouveaux »', meta: 'Demain 09:00 · récurrent', tone: 'warn' as const, tag: 'tâche auto' },
]

export const RECENT = [
  { ok: true, title: '52/52 comptes · Mass posting', meta: 'Il y a 2 h', tag: 'réussi' },
  { ok: false, title: '2/24 comptes · Story programmée', meta: 'Il y a 5 h · 2 échecs à relancer', tag: 'partiel' },
  { ok: true, title: '36/36 comptes · TikTok', meta: 'Il y a 8 h', tag: 'réussi' },
]

export const RUN = { active: true, label: 'Mass posting · reel_042.mp4', done: 42, total: 52, eta: '~9 s' }
